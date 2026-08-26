/**
 * Validation layer for in-client AI assistant proposals.
 *
 * The assistant is designed to run on free-tier, mid-quality LLMs (Gemini Flash,
 * Groq Llama, OpenRouter free tiers). It never writes to storage; it emits
 * *proposals* that this module validates before the UI is allowed to render a
 * confirm/reject card. Everything that a weak model gets wrong reliably —
 * hallucinated settings keys, Polish letters inside regexes, uncompilable
 * patterns, unknown event names, macro types that silently do nothing — must be
 * caught here.
 *
 * Two deliberate design choices:
 *
 * 1. **Repair before reject.** The single most common defect is a pattern
 *    containing Polish diacritics, because the game's fiction is Polish. The
 *    Arkadia feed itself is diacritic-free (see the patterns in
 *    `@client/scripts/spells.ts`, `prettyContainers.ts`, ...: every literal is
 *    plain ASCII), and the client already normalises input through
 *    `stripPolishCharacters`. So the established convention is a straight
 *    character fold, and we apply exactly that fold to the proposal rather than
 *    bouncing it back to a model that will most likely repeat the mistake.
 *    Repairs are reported so the card can show what changed.
 *
 * 2. **Flag, never silently strip.** Suspicious commands are surfaced as
 *    warnings attached to the proposal. The user, not the validator, decides.
 *
 * Messages shown to the user are Polish and ASCII-only (this codebase keeps
 * Polish letters out of regexes and out of anything that round-trips through
 * game commands).
 */

import { stripPolishCharacters } from '@client/stripPolishCharacters';
import { SUPPORTED_EVENTS, type BuiltInMacroType, type UserMacro, type UserTrigger } from '@client/scripts/userTriggers';
import type { UserAlias } from '@client/scripts/userAliases';
import type { CustomBind } from '../keymapTypes';
import {
    lookupSetting,
    suggestSettingKeys,
    type SettingDescriptor,
} from './settingsRegistry';

export {
    SETTING_DESCRIPTORS,
    lookupSetting,
    suggestSettingKeys,
    assistantEditableKeys,
    editDistance,
} from './settingsRegistry';
export type { SettingDescriptor, SettingScope, SettingLookup, SettingValueType } from './settingsRegistry';

// ---------------------------------------------------------------------------
// Proposal shapes
// ---------------------------------------------------------------------------

export type ProposalKind = 'settingChange' | 'alias' | 'trigger' | 'bind';

export interface SettingChangeProposal {
    kind: 'settingChange';
    key: string;
    value: unknown;
    reason?: string;
}

/** Mirrors `UserAlias` (`@client/scripts/userAliases`) plus card metadata. */
export interface AliasProposal extends UserAlias {
    kind: 'alias';
    reason?: string;
}

/** Mirrors `UserTrigger` (`@client/scripts/userTriggers`) plus card metadata. */
export interface TriggerProposal extends UserTrigger {
    kind: 'trigger';
    reason?: string;
}

/** Mirrors `CustomBind` (`@modules/core/keymapTypes`) plus card metadata. */
export interface BindProposal extends CustomBind {
    kind: 'bind';
    reason?: string;
}

export type AssistantProposal =
    | SettingChangeProposal
    | AliasProposal
    | TriggerProposal
    | BindProposal;

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
    /** Stable machine-checkable code (evals assert on this, not on prose). */
    code: string;
    /** Dotted path inside the proposal, e.g. `macros[0].command`. */
    path: string;
    severity: IssueSeverity;
    /** Polish, ASCII-only explanation for the confirm card. */
    message: string;
    /** Optional machine-readable hints (suggested keys, allowed values, ...). */
    suggestions?: string[];
}

export interface Repair {
    code: string;
    path: string;
    from: string;
    to: string;
    message: string;
}

export interface ValidationResult<T extends AssistantProposal = AssistantProposal> {
    ok: boolean;
    /** Present only when `ok`; carries every applied repair. */
    proposal?: T;
    issues: ValidationIssue[];
    repairs: Repair[];
    /** Command-safety findings for anything that would be sent to the game. */
    commandFlags: CommandFlag[];
}

const err = (code: string, path: string, message: string, suggestions?: string[]): ValidationIssue =>
    ({ code, path, severity: 'error', message, suggestions });
const warn = (code: string, path: string, message: string, suggestions?: string[]): ValidationIssue =>
    ({ code, path, severity: 'warning', message, suggestions });

// ---------------------------------------------------------------------------
// ASCII / regex safety
// ---------------------------------------------------------------------------

/** Max source length for a proposed pattern. */
export const MAX_PATTERN_LENGTH = 400;
/** Flags `userTriggers` actually honours. Anything else silently misbehaves. */
export const SUPPORTED_TRIGGER_FLAGS = 'gim';
/** Above this many chained commands we warn; above the hard cap we reject. */
export const COMMAND_COUNT_WARN_THRESHOLD = 10;
export const COMMAND_COUNT_HARD_CAP = 100;

/**
 * Polish letters, written as `\u` escapes so this file itself obeys the repo
 * rule that regex patterns stay ASCII-compatible.
 * A/a, C/c, E/e, L/l, N/n, O/o, S/s, Z/z (acute), Z/z (dot above).
 */
const POLISH_LETTER = /[\u0104\u0105\u0106\u0107\u0118\u0119\u0141\u0142\u0143\u0144\u00D3\u00F3\u015A\u015B\u0179\u017A\u017B\u017C]/;

const isPolishLetter = (ch: string): boolean => POLISH_LETTER.test(ch);

export interface RegexSanitizeResult {
    ok: boolean;
    /** Repaired, compile-checked source. Undefined when `ok` is false. */
    pattern?: string;
    /** Compiled regex built from `pattern` (never exposed when `ok` is false). */
    regex?: RegExp;
    issues: ValidationIssue[];
    repairs: Repair[];
}

/**
 * Fold Polish letters in a regex source down to ASCII, matching the convention
 * used everywhere in `src/client/scripts` (game text arrives without
 * diacritics). Refuses to guess where the fold would change the meaning of the
 * pattern rather than the meaning of a literal:
 *
 * - a Polish letter directly after a backslash is an escape sequence, not a
 *   literal, so folding it would invent a different escape;
 * - a Polish letter used as a character-class range endpoint (`[a-<pl>]`)
 *   would silently redefine the range.
 */
function repairPolishLetters(source: string, path: string): { text: string; issues: ValidationIssue[]; repairs: Repair[] } {
    const issues: ValidationIssue[] = [];
    const repairs: Repair[] = [];
    let out = '';
    let escaped = false;
    let inClass = false;
    /** True when the previous character was an unescaped `-` (a range dash). */
    let prevIsRangeDash = false;
    /** Index of the character that opened the current class, for `[-x]`. */
    let classOpenIndex = -1;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];

        if (escaped) {
            if (isPolishLetter(ch)) {
                issues.push(err(
                    'polishLetterUnrepairable',
                    path,
                    `Wzorzec zawiera polska litere w sekwencji ucieczki ("\\${ch}"). Nie moge tego bezpiecznie poprawic - przepisz wzorzec bez polskich znakow.`,
                ));
                return { text: source, issues, repairs };
            }
            out += ch;
            escaped = false;
            prevIsRangeDash = false;
            continue;
        }

        if (ch === '\\') {
            out += ch;
            escaped = true;
            prevIsRangeDash = false;
            continue;
        }

        if (!inClass && ch === '[') {
            inClass = true;
            classOpenIndex = i;
            out += ch;
            prevIsRangeDash = false;
            continue;
        }

        if (inClass && ch === ']') {
            inClass = false;
            classOpenIndex = -1;
            out += ch;
            prevIsRangeDash = false;
            continue;
        }

        if (isPolishLetter(ch)) {
            const next = source[i + 1];
            // `[-x]` and `[^-x]` open with a literal dash, not a range.
            const firstContentIndex = classOpenIndex + (source[classOpenIndex + 1] === '^' ? 2 : 1);
            const dashIsLiteral = i - 1 === firstContentIndex;
            const isRangeEnd = inClass && prevIsRangeDash && !dashIsLiteral;
            const isRangeStart = inClass && next === '-' && source[i + 2] !== undefined && source[i + 2] !== ']';
            if (isRangeEnd || isRangeStart) {
                issues.push(err(
                    'polishLetterUnrepairable',
                    path,
                    'Wzorzec uzywa polskiej litery jako granicy zakresu w klasie znakow. Nie moge tego bezpiecznie poprawic - wypisz znaki pojedynczo, bez polskich liter.',
                ));
                return { text: source, issues, repairs };
            }
            const ascii = stripPolishCharacters(ch);
            repairs.push({
                code: 'polishLetterFolded',
                path,
                from: ch,
                to: ascii,
                message: `Zamieniono "${ch}" na "${ascii}" - gra wysyla tekst bez polskich znakow, wiec wzorzec z polska litera nigdy by nie zadzialal.`,
            });
            out += ascii;
            prevIsRangeDash = false;
            continue;
        }

        out += ch;
        prevIsRangeDash = ch === '-';
    }

    return { text: out, issues, repairs };
}

/**
 * Heuristic for catastrophic backtracking: an unbounded quantifier applied to a
 * group that itself contains an unbounded quantifier — `(a+)+`, `(\s*\w+)*`,
 * `(.+)+`, `([a-z]*){2,}`. Conservative on purpose: it only looks at nesting,
 * so it will not catch every pathological pattern (see the module tests).
 */
export function hasNestedUnboundedQuantifier(source: string): boolean {
    const UNBOUNDED = /[*+]|\{\d+,\}/;
    for (let i = 0; i < source.length; i++) {
        if (source[i] !== '(' || source[i - 1] === '\\') continue;
        // Walk to the matching ')'.
        let depth = 0;
        let end = -1;
        for (let j = i; j < source.length; j++) {
            const c = source[j];
            if (c === '\\') { j++; continue; }
            if (c === '(') depth++;
            else if (c === ')') {
                depth--;
                if (depth === 0) { end = j; break; }
            }
        }
        if (end === -1) continue;
        const after = source.slice(end + 1);
        const outerQuantifier = /^(?:[*+]|\{\d+,\})/.exec(after);
        if (!outerQuantifier) continue;
        // Strip escapes so `\+` inside the body is not read as a quantifier.
        const body = source.slice(i + 1, end).replace(/\\./g, '');
        if (UNBOUNDED.test(body)) return true;
    }
    return false;
}

/**
 * Validate (and where unambiguous, repair) a proposed regex source.
 * `wrap` lets aliases be checked in the exact form the client compiles them
 * (`^...$`) without the anchors leaking into the stored pattern.
 */
export function sanitizeRegexSource(
    source: unknown,
    options: { path?: string; flags?: string; wrap?: (p: string) => string } = {},
): RegexSanitizeResult {
    const path = options.path ?? 'pattern';
    const issues: ValidationIssue[] = [];

    if (typeof source !== 'string' || source.trim() === '') {
        return { ok: false, issues: [err('emptyPattern', path, 'Wzorzec jest pusty.')], repairs: [] };
    }
    if (source.length > MAX_PATTERN_LENGTH) {
        return {
            ok: false,
            issues: [err(
                'patternTooLong',
                path,
                `Wzorzec ma ${source.length} znakow, a limit to ${MAX_PATTERN_LENGTH}. Skroc go.`,
            )],
            repairs: [],
        };
    }

    const { text, issues: repairIssues, repairs } = repairPolishLetters(source, path);
    if (repairIssues.length > 0) {
        return { ok: false, issues: repairIssues, repairs: [] };
    }

    const nonAscii = Array.from(text).find(ch => ch.charCodeAt(0) > 127);
    if (nonAscii !== undefined) {
        return {
            ok: false,
            issues: [err(
                'nonAsciiPattern',
                path,
                `Wzorzec zawiera znak spoza ASCII ("${nonAscii}"). Wzorce w tym kliencie musza byc w czystym ASCII.`,
            )],
            repairs,
        };
    }

    const flags = options.flags ?? '';
    for (const flag of flags) {
        if (!SUPPORTED_TRIGGER_FLAGS.includes(flag)) {
            issues.push(err(
                'unsupportedFlag',
                `${path}.flags`,
                `Flaga "${flag}" nie jest obslugiwana - dozwolone sa tylko: ${SUPPORTED_TRIGGER_FLAGS.split('').join(', ')}.`,
            ));
        }
    }
    if (issues.length > 0) return { ok: false, issues, repairs };

    if (hasNestedUnboundedQuantifier(text)) {
        return {
            ok: false,
            issues: [err(
                'catastrophicPattern',
                path,
                'Wzorzec ma zagniezdzone kwantyfikatory bez ograniczenia (np. "(a+)+") i moze zawiesic klienta. Uprosc go.',
            )],
            repairs,
        };
    }

    const compiled = options.wrap ? options.wrap(text) : text;
    let regex: RegExp;
    try {
        regex = new RegExp(compiled, flags.replace(/[^gi]/g, ''));
    } catch (e) {
        return {
            ok: false,
            issues: [err(
                'invalidRegex',
                path,
                `Wzorzec nie jest poprawnym wyrazeniem regularnym: ${(e as Error).message}`,
            )],
            repairs,
        };
    }

    return { ok: true, pattern: text, regex, issues: [], repairs };
}

/** Number of capture groups in a compiled pattern. */
export function countCaptureGroups(source: string): number {
    try {
        return new RegExp(`${source}|`).exec('')!.length - 1;
    } catch {
        return 0;
    }
}

// ---------------------------------------------------------------------------
// Regex replay against user-selected log lines
// ---------------------------------------------------------------------------

export interface ReplayLineResult {
    line: string;
    matched: boolean;
    /** The line as the client actually sees it, when it differs from `line`. */
    normalizedLine?: string;
    /** True when the line only matched after folding Polish letters. */
    matchedAfterNormalization?: boolean;
    match?: string;
    index?: number;
    /** Capture groups 1..n. */
    groups?: (string | undefined)[];
    namedGroups?: Record<string, string | undefined>;
}

export interface ReplayResult {
    ok: boolean;
    /** Repaired pattern that was actually replayed. */
    pattern?: string;
    flags: string;
    issues: ValidationIssue[];
    repairs: Repair[];
    lines: ReplayLineResult[];
    matchedCount: number;
    /** True when every supplied line matched. */
    matchedAll: boolean;
}

/**
 * Replay a proposed trigger pattern against the log lines the user picked, so
 * the confirm card can *prove* the trigger fires before anything is stored.
 * The pattern is sanitised first, so what gets replayed is exactly what would
 * be saved.
 */
export function replayTriggerPattern(
    pattern: unknown,
    lines: readonly string[],
    flags = '',
): ReplayResult {
    const sanitized = sanitizeRegexSource(pattern, { path: 'pattern', flags });
    if (!sanitized.ok || !sanitized.pattern) {
        return {
            ok: false,
            flags,
            issues: sanitized.issues,
            repairs: sanitized.repairs,
            lines: [],
            matchedCount: 0,
            matchedAll: false,
        };
    }

    const caseInsensitive = flags.includes('i');
    const execFlags = caseInsensitive ? 'i' : '';
    const results: ReplayLineResult[] = lines.map(line => {
        const re = new RegExp(sanitized.pattern!, execFlags);
        const direct = re.exec(line);
        if (direct) {
            return {
                line,
                matched: true,
                match: direct[0],
                index: direct.index,
                groups: direct.slice(1),
                namedGroups: direct.groups ? { ...direct.groups } : undefined,
            };
        }
        const normalized = stripPolishCharacters(line);
        if (normalized !== line) {
            const fallback = new RegExp(sanitized.pattern!, execFlags).exec(normalized);
            if (fallback) {
                return {
                    line,
                    normalizedLine: normalized,
                    matched: true,
                    matchedAfterNormalization: true,
                    match: fallback[0],
                    index: fallback.index,
                    groups: fallback.slice(1),
                    namedGroups: fallback.groups ? { ...fallback.groups } : undefined,
                };
            }
            return { line, normalizedLine: normalized, matched: false };
        }
        return { line, matched: false };
    });

    const matchedCount = results.filter(r => r.matched).length;
    return {
        ok: true,
        pattern: sanitized.pattern,
        flags,
        issues: [],
        repairs: sanitized.repairs,
        lines: results,
        matchedCount,
        matchedAll: lines.length > 0 && matchedCount === lines.length,
    };
}

// ---------------------------------------------------------------------------
// Command safety
// ---------------------------------------------------------------------------

export interface CommandFlag {
    code: string;
    path: string;
    /** The fragment that triggered the flag. */
    match: string;
    message: string;
}

interface CommandRule {
    code: string;
    /** ASCII-only, per the repo regex rule; the game feed is ASCII too. */
    test: RegExp;
    message: string;
}

/**
 * Commands worth a second look. Deliberately conservative — the point is to
 * make the user read the card, not to build a blocklist. Attacking, looting and
 * moving are normal MUD play and are *not* flagged.
 */
const COMMAND_RULES: CommandRule[] = [
    { code: 'dropsItems', test: /\b(wyrzuc|porzuc|upusc)\b/i, message: 'Komenda wyrzuca przedmioty.' },
    { code: 'destroysItems', test: /\b(zniszcz|spal|podrzyj|rozerwij|polam)\b/i, message: 'Komenda niszczy przedmioty.' },
    { code: 'givesAwayItems', test: /\b(daj|oddaj|wrecz|sprzedaj|zastaw)\b/i, message: 'Komenda oddaje lub sprzedaje przedmioty.' },
    { code: 'movesMoney', test: /\b(wyplac|wplac|przelej)\b/i, message: 'Komenda operuje na pieniadzach.' },
    { code: 'endsSession', test: /\b(quit|koniec|wyloguj|zakoncz)\b/i, message: 'Komenda konczy sesje w grze.' },
    { code: 'exposesPassword', test: /\b(haslo|password|passwd)\b/i, message: 'Komenda zawiera slowo "haslo" - nigdy nie wysylaj hasla przez alias ani trigger.' },
    { code: 'wipesClientData', test: /\/(usun_skroty|usun_skrot|zlom-reset|walka_restart|nabindach--)\b/i, message: 'Komenda kasuje dane zapisane w kliencie.' },
    { code: 'deletesCharacter', test: /\b(usun\s+postac|skasuj\s+postac|samobojstwo)\b/i, message: 'Komenda moze usunac postac.' },
];

/** Split a command string the way the client does: `;`, newline and `#`. */
export function splitCommands(command: string): string[] {
    return command
        .split(/[;\n#]/)
        .map(part => part.trim())
        .filter(part => part.length > 0);
}

export interface CommandSafetyReport {
    commandCount: number;
    flags: CommandFlag[];
    /** True when nothing alarming was found and the command count is sane. */
    safe: boolean;
    /** Hard failures (empty command, absurd fan-out). */
    issues: ValidationIssue[];
}

/**
 * Inspect anything that would be sent to the game. Findings are *flags*, never
 * edits: the proposal keeps whatever the model wrote, and the card shows why it
 * deserves a look.
 */
export function inspectCommand(command: unknown, path = 'command'): CommandSafetyReport {
    if (typeof command !== 'string' || command.trim() === '') {
        return {
            commandCount: 0,
            flags: [],
            safe: false,
            issues: [err('emptyCommand', path, 'Komenda jest pusta.')],
        };
    }

    const parts = splitCommands(command);
    const flags: CommandFlag[] = [];
    const issues: ValidationIssue[] = [];

    for (const rule of COMMAND_RULES) {
        const m = rule.test.exec(command);
        if (m) {
            flags.push({ code: rule.code, path, match: m[0], message: `${rule.message} Sprawdz ja przed zatwierdzeniem.` });
        }
    }

    if (parts.length > COMMAND_COUNT_HARD_CAP) {
        issues.push(err(
            'tooManyCommands',
            path,
            `Komenda wysyla ${parts.length} polecen naraz (limit ${COMMAND_COUNT_HARD_CAP}). To wyglada na spam i zostalo odrzucone.`,
        ));
    } else if (parts.length > COMMAND_COUNT_WARN_THRESHOLD) {
        flags.push({
            code: 'manyCommands',
            path,
            match: `${parts.length}`,
            message: `Komenda wysyla ${parts.length} polecen naraz. Upewnij sie, ze o to chodzilo.`,
        });
    }

    if (/\$i/.test(command)) {
        flags.push({
            code: 'rangeExpansion',
            path,
            match: '$i',
            message: 'Komenda uzywa zakresu "$i" - jedno wywolanie moze wyslac do 50 polecen.',
        });
    }

    return {
        commandCount: parts.length,
        flags,
        safe: flags.length === 0 && issues.length === 0,
        issues,
    };
}

// ---------------------------------------------------------------------------
// Setting value validation
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function validateSettingValue(descriptor: SettingDescriptor, value: unknown): ValidationIssue[] {
    const path = 'value';
    const label = descriptor.label ? ` (${descriptor.label})` : '';

    if (value === undefined || value === null) {
        return descriptor.optional
            ? []
            : [err('missingValue', path, `Brak wartosci dla "${descriptor.key}"${label}.`)];
    }

    switch (descriptor.type) {
        case 'boolean':
            return typeof value === 'boolean'
                ? []
                : [err('wrongValueType', path, `"${descriptor.key}"${label} przyjmuje wartosc logiczna (true/false), a otrzymalem: ${describeValue(value)}.`)];

        case 'number': {
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                return [err('wrongValueType', path, `"${descriptor.key}"${label} przyjmuje liczbe, a otrzymalem: ${describeValue(value)}.`)];
            }
            if (descriptor.integer && !Number.isInteger(value)) {
                return [err('nonIntegerValue', path, `"${descriptor.key}"${label} przyjmuje liczbe calkowita, a otrzymalem ${value}.`)];
            }
            if (descriptor.min !== undefined && value < descriptor.min) {
                return [err('valueOutOfRange', path, `"${descriptor.key}"${label} musi byc >= ${descriptor.min}, a otrzymalem ${value}.`)];
            }
            if (descriptor.max !== undefined && value > descriptor.max) {
                return [err('valueOutOfRange', path, `"${descriptor.key}"${label} musi byc <= ${descriptor.max}, a otrzymalem ${value}.`)];
            }
            return [];
        }

        case 'string':
            return typeof value === 'string'
                ? []
                : [err('wrongValueType', path, `"${descriptor.key}"${label} przyjmuje tekst, a otrzymalem: ${describeValue(value)}.`)];

        case 'enum': {
            const allowed = descriptor.enumValues ?? [];
            if (typeof value === 'string' && allowed.includes(value)) return [];
            return [err(
                'valueNotAllowed',
                path,
                `"${descriptor.key}"${label} przyjmuje jedna z wartosci: ${allowed.join(', ')}. Otrzymalem: ${describeValue(value)}.`,
                [...allowed],
            )];
        }

        case 'color': {
            if (typeof value === 'string' && (HEX_COLOR.test(value) || value === 'transparent')) return [];
            return [err(
                'invalidColor',
                path,
                `"${descriptor.key}"${label} przyjmuje kolor w formacie "#rrggbb" albo "transparent". Otrzymalem: ${describeValue(value)}.`,
            )];
        }

        case 'stringArray':
            return Array.isArray(value) && value.every(v => typeof v === 'string')
                ? []
                : [err('wrongValueType', path, `"${descriptor.key}"${label} przyjmuje liste tekstow. Otrzymalem: ${describeValue(value)}.`)];

        case 'booleanArray': {
            const okShape = Array.isArray(value) && value.every(v => typeof v === 'boolean');
            if (!okShape) {
                return [err('wrongValueType', path, `"${descriptor.key}"${label} przyjmuje liste wartosci logicznych. Otrzymalem: ${describeValue(value)}.`)];
            }
            if (descriptor.length !== undefined && (value as unknown[]).length !== descriptor.length) {
                return [err('wrongArrayLength', path, `"${descriptor.key}"${label} wymaga dokladnie ${descriptor.length} wartosci, a otrzymalem ${(value as unknown[]).length}.`)];
            }
            return [];
        }

        case 'complex':
        default:
            return [err(
                'settingNotAssistantEditable',
                'key',
                `"${descriptor.key}" ma zlozona strukture i asystent nie moze jej zmieniac - ustaw ja recznie w opcjach klienta.`,
            )];
    }
}

function describeValue(value: unknown): string {
    if (typeof value === 'string') return `"${value}"`;
    if (Array.isArray(value)) return `lista (${value.length} el.)`;
    if (value === null) return 'null';
    if (typeof value === 'object') return 'obiekt';
    return String(value);
}

// ---------------------------------------------------------------------------
// Per-kind validation
// ---------------------------------------------------------------------------

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(issues: ValidationIssue[], repairs: Repair[] = [], commandFlags: CommandFlag[] = []): ValidationResult {
    return { ok: false, issues, repairs, commandFlags };
}

export function validateSettingChange(input: Record<string, unknown>): ValidationResult<SettingChangeProposal> {
    const lookup = lookupSetting(input.key);
    if (lookup.status === 'unknown') {
        const suggestions = typeof input.key === 'string' ? suggestSettingKeys(input.key) : [];
        return fail([err(
            'unknownSettingKey',
            'key',
            `Nie ma ustawienia "${String(input.key)}".${suggestions.length ? ` Czy chodzilo o: ${suggestions.join(', ')}?` : ''}`,
            suggestions,
        )]) as ValidationResult<SettingChangeProposal>;
    }
    if (lookup.status === 'ambiguous') {
        const candidates = lookup.candidates.map(c => c.key);
        return fail([err(
            'ambiguousSettingKey',
            'key',
            `Klucz "${String(input.key)}" jest niejednoznaczny - podaj pelna nazwe: ${candidates.join(', ')}.`,
            candidates,
        )]) as ValidationResult<SettingChangeProposal>;
    }

    const descriptor = lookup.descriptor;
    const issues = validateSettingValue(descriptor, input.value);
    if (issues.length > 0) {
        return fail(issues) as ValidationResult<SettingChangeProposal>;
    }

    const commandFlags: CommandFlag[] = [];
    // Several settings are literally command strings sent to the game.
    if (descriptor.type === 'string' && /command|Action$/i.test(descriptor.field) && typeof input.value === 'string' && input.value.trim() !== '') {
        commandFlags.push(...inspectCommand(input.value, 'value').flags);
    }

    return {
        ok: true,
        proposal: {
            kind: 'settingChange',
            key: descriptor.key,
            value: input.value,
            reason: typeof input.reason === 'string' ? input.reason : undefined,
        },
        issues: [],
        repairs: [],
        commandFlags,
    };
}

export function validateAlias(input: Record<string, unknown>): ValidationResult<AliasProposal> {
    const issues: ValidationIssue[] = [];
    const repairs: Repair[] = [];

    // The client compiles alias patterns as `^<pattern>$`.
    const sanitized = sanitizeRegexSource(input.pattern, {
        path: 'pattern',
        wrap: p => `^${p}$`,
    });
    if (!sanitized.ok || !sanitized.pattern) {
        return fail(sanitized.issues, sanitized.repairs) as ValidationResult<AliasProposal>;
    }
    repairs.push(...sanitized.repairs);

    const safety = inspectCommand(input.command, 'command');
    issues.push(...safety.issues);

    let command = typeof input.command === 'string' ? input.command : '';
    if (issues.length === 0 && command) {
        // `stripPolishCharacters` is applied to outgoing commands by the client
        // anyway (see CommandProcessor), so fold here for an honest preview.
        const folded = stripPolishCharacters(command);
        if (folded !== command) {
            repairs.push({
                code: 'commandFolded',
                path: 'command',
                from: command,
                to: folded,
                message: 'Usunieto polskie znaki z komendy - klient i tak wysyla ja bez nich.',
            });
            command = folded;
        }

        const groupCount = countCaptureGroups(sanitized.pattern);
        const refs = [...command.matchAll(/\$(\d+)/g)].map(m => Number(m[1]));
        const dangling = refs.filter(n => n > groupCount);
        if (dangling.length > 0) {
            issues.push(err(
                'undefinedGroupReference',
                'command',
                `Komenda uzywa ${dangling.map(n => `$${n}`).join(', ')}, ale wzorzec ma tylko ${groupCount} grup przechwytujacych.`,
            ));
        }
        if (/\$i/.test(command) && groupCount === 0) {
            issues.push(err(
                'rangeWithoutGroup',
                'command',
                'Komenda uzywa zakresu "$i", ale wzorzec nie ma grupy przechwytujacej, z ktorej mozna odczytac zakres (np. "(.+)").',
            ));
        }
    }

    if (input.overrides !== undefined) {
        if (!isPlainObject(input.overrides) || Object.values(input.overrides).some(v => typeof v !== 'string')) {
            issues.push(err('invalidOverrides', 'overrides', 'Pole "overrides" musi byc mapa: nazwa postaci -> komenda.'));
        }
    }

    if (issues.some(i => i.severity === 'error')) {
        return fail(issues, repairs, safety.flags) as ValidationResult<AliasProposal>;
    }

    const proposal: AliasProposal = {
        kind: 'alias',
        pattern: sanitized.pattern,
        command,
        reason: typeof input.reason === 'string' ? input.reason : undefined,
    };
    if (isPlainObject(input.overrides)) {
        proposal.overrides = input.overrides as Record<string, string>;
    }

    return { ok: true, proposal, issues: issues.filter(i => i.severity === 'warning'), repairs, commandFlags: safety.flags };
}

const BUILT_IN_MACRO_TYPES: readonly BuiltInMacroType[] = [
    'uppercase', 'color', 'replace', 'beep', 'mute', 'unmute', 'command',
    'slowBlink', 'rapidBlink', 'dim', 'functionalBind', 'wrap', 'notify',
];

/** Macros `applyEventMacros` actually handles; the rest need text context. */
const EVENT_SAFE_MACRO_TYPES: readonly string[] = ['beep', 'mute', 'unmute', 'command', 'functionalBind', 'notify'];

const DIM_EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];

export const SUPPORTED_EVENT_IDS: readonly string[] = SUPPORTED_EVENTS.map(e => e.id);

function validateMacro(raw: unknown, index: number, triggerType: 'pattern' | 'event'): {
    macro?: UserMacro;
    issues: ValidationIssue[];
    repairs: Repair[];
    flags: CommandFlag[];
} {
    const path = `macros[${index}]`;
    const issues: ValidationIssue[] = [];
    const repairs: Repair[] = [];
    const flags: CommandFlag[] = [];

    if (!isPlainObject(raw)) {
        return { issues: [err('invalidMacro', path, 'Kazde makro musi byc obiektem.')], repairs, flags };
    }
    const type = raw.type;
    if (typeof type !== 'string' || type === '') {
        return { issues: [err('missingMacroType', `${path}.type`, 'Makro nie ma pola "type".')], repairs, flags };
    }

    const isPlugin = type.startsWith('plugin:');
    if (!isPlugin && !BUILT_IN_MACRO_TYPES.includes(type as BuiltInMacroType)) {
        return {
            issues: [err(
                'unknownMacroType',
                `${path}.type`,
                `Nieznany typ makra "${type}". Dostepne: ${BUILT_IN_MACRO_TYPES.join(', ')}.`,
                [...BUILT_IN_MACRO_TYPES],
            )],
            repairs,
            flags,
        };
    }

    if (triggerType === 'event' && !EVENT_SAFE_MACRO_TYPES.includes(type)) {
        return {
            issues: [err(
                'macroNotSupportedForEvent',
                `${path}.type`,
                `Makro "${type}" dziala tylko dla triggerow tekstowych - trigger zdarzeniowy nie ma linii do zmodyfikowania. Dostepne dla zdarzen: ${EVENT_SAFE_MACRO_TYPES.join(', ')}.`,
                [...EVENT_SAFE_MACRO_TYPES],
            )],
            repairs,
            flags,
        };
    }

    const macro: UserMacro = { type };

    const requireString = (field: keyof UserMacro & string, code: string, message: string, allowEmpty = false) => {
        const v = raw[field];
        if (typeof v !== 'string' || (!allowEmpty && v.trim() === '')) {
            issues.push(err(code, `${path}.${field}`, message));
            return undefined;
        }
        return v;
    };

    switch (type) {
        case 'color': {
            const color = requireString('color', 'missingMacroColor', 'Makro "color" wymaga pola "color".');
            if (color !== undefined) {
                if (!HEX_COLOR.test(color)) {
                    issues.push(err('invalidColor', `${path}.color`, `Kolor "${color}" nie jest w formacie "#rrggbb".`));
                } else {
                    macro.color = color;
                }
            }
            break;
        }
        case 'replace': {
            const to = raw.to;
            if (typeof to !== 'string') {
                issues.push(err('missingMacroTo', `${path}.to`, 'Makro "replace" wymaga pola "to" (moze byc pustym tekstem).'));
            } else {
                macro.to = to;
            }
            break;
        }
        case 'command':
        case 'functionalBind': {
            const command = requireString('command', 'missingMacroCommand', `Makro "${type}" wymaga pola "command".`);
            if (command !== undefined) {
                const safety = inspectCommand(command, `${path}.command`);
                issues.push(...safety.issues);
                flags.push(...safety.flags);
                const folded = stripPolishCharacters(command);
                if (folded !== command) {
                    repairs.push({
                        code: 'commandFolded',
                        path: `${path}.command`,
                        from: command,
                        to: folded,
                        message: 'Usunieto polskie znaki z komendy - klient i tak wysyla ja bez nich.',
                    });
                }
                macro.command = folded;
            }
            if (type === 'functionalBind') {
                const label = requireString('label', 'missingMacroLabel', 'Makro "functionalBind" wymaga pola "label" (opis przycisku).');
                if (label !== undefined) macro.label = label;
            }
            break;
        }
        case 'beep': {
            if (raw.soundKey !== undefined) {
                if (typeof raw.soundKey !== 'string') {
                    issues.push(err('wrongValueType', `${path}.soundKey`, 'Pole "soundKey" musi byc tekstem.'));
                } else {
                    macro.soundKey = raw.soundKey;
                }
            }
            break;
        }
        case 'notify': {
            if (raw.message !== undefined) {
                if (typeof raw.message !== 'string') {
                    issues.push(err('wrongValueType', `${path}.message`, 'Pole "message" musi byc tekstem.'));
                } else {
                    macro.message = raw.message;
                }
            } else if (triggerType === 'event') {
                issues.push(err(
                    'missingMacroMessage',
                    `${path}.message`,
                    'Makro "notify" w triggerze zdarzeniowym wymaga pola "message" - nie ma linii tekstu, z ktorej mozna wziac tresc.',
                ));
            }
            break;
        }
        case 'wrap': {
            const prefix = typeof raw.wrapPrefix === 'string' ? raw.wrapPrefix : '';
            const suffix = typeof raw.wrapSuffix === 'string' ? raw.wrapSuffix : '';
            if (prefix === '' && suffix === '') {
                issues.push(err('emptyWrap', path, 'Makro "wrap" wymaga pola "wrapPrefix" albo "wrapSuffix".'));
            } else {
                macro.wrapPrefix = prefix;
                macro.wrapSuffix = suffix;
            }
            if (raw.wrapScope !== undefined) {
                if (raw.wrapScope !== 'match' && raw.wrapScope !== 'line') {
                    issues.push(err('valueNotAllowed', `${path}.wrapScope`, 'Pole "wrapScope" przyjmuje "match" albo "line".', ['match', 'line']));
                } else {
                    macro.wrapScope = raw.wrapScope;
                }
            }
            break;
        }
        case 'dim': {
            for (const field of ['dimStartOpacity', 'dimEndOpacity'] as const) {
                const v = raw[field];
                if (v === undefined) continue;
                if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
                    issues.push(err('valueOutOfRange', `${path}.${field}`, `Pole "${field}" przyjmuje liczbe od 0 do 1.`));
                } else {
                    macro[field] = v;
                }
            }
            if (raw.dimDuration !== undefined) {
                const v = raw.dimDuration;
                if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 60000) {
                    issues.push(err('valueOutOfRange', `${path}.dimDuration`, 'Pole "dimDuration" przyjmuje liczbe milisekund od 1 do 60000.'));
                } else {
                    macro.dimDuration = v;
                }
            }
            if (raw.dimEasing !== undefined) {
                if (typeof raw.dimEasing !== 'string' || !DIM_EASINGS.includes(raw.dimEasing)) {
                    issues.push(err('valueNotAllowed', `${path}.dimEasing`, `Pole "dimEasing" przyjmuje: ${DIM_EASINGS.join(', ')}.`, DIM_EASINGS));
                } else {
                    macro.dimEasing = raw.dimEasing as UserMacro['dimEasing'];
                }
            }
            break;
        }
        default:
            if (isPlugin && raw.pluginConfig !== undefined) {
                if (!isPlainObject(raw.pluginConfig)) {
                    issues.push(err('invalidPluginConfig', `${path}.pluginConfig`, 'Pole "pluginConfig" musi byc obiektem.'));
                } else {
                    macro.pluginConfig = raw.pluginConfig;
                }
            }
            break;
    }

    if (issues.some(i => i.severity === 'error')) {
        return { issues, repairs, flags };
    }
    return { macro, issues, repairs, flags };
}

export function validateTrigger(input: Record<string, unknown>): ValidationResult<TriggerProposal> {
    const issues: ValidationIssue[] = [];
    const repairs: Repair[] = [];
    const commandFlags: CommandFlag[] = [];

    const rawType = input.type === undefined ? 'pattern' : input.type;
    if (rawType !== 'pattern' && rawType !== 'event') {
        return fail([err(
            'invalidTriggerType',
            'type',
            'Pole "type" przyjmuje "pattern" albo "event".',
            ['pattern', 'event'],
        )]) as ValidationResult<TriggerProposal>;
    }
    const triggerType = rawType;

    const proposal: TriggerProposal = { kind: 'trigger', type: triggerType, macros: [] };

    if (triggerType === 'event') {
        const event = input.event;
        if (typeof event !== 'string' || event.trim() === '') {
            return fail([err('missingEvent', 'event', 'Trigger zdarzeniowy wymaga pola "event".', [...SUPPORTED_EVENT_IDS])]) as ValidationResult<TriggerProposal>;
        }
        if (!SUPPORTED_EVENT_IDS.includes(event)) {
            const near = SUPPORTED_EVENT_IDS
                .map(id => ({ id, score: editDistanceLocal(id.toLowerCase(), event.toLowerCase()) }))
                .sort((a, b) => a.score - b.score)
                .slice(0, 3)
                .map(c => c.id);
            return fail([err(
                'unknownEvent',
                'event',
                `Zdarzenie "${event}" nie istnieje. Dostepne zdarzenia: ${SUPPORTED_EVENT_IDS.join(', ')}.`,
                near,
            )]) as ValidationResult<TriggerProposal>;
        }
        proposal.event = event;
        if (input.pattern !== undefined) {
            issues.push(warn('unusedPattern', 'pattern', 'Trigger zdarzeniowy ignoruje pole "pattern".'));
        }
        if (input.gmcpMsgType !== undefined) {
            issues.push(warn('unusedGmcpMsgType', 'gmcpMsgType', 'Trigger zdarzeniowy ignoruje pole "gmcpMsgType".'));
        }
    } else {
        const flags = typeof input.flags === 'string' ? input.flags : '';
        const sanitized = sanitizeRegexSource(input.pattern, { path: 'pattern', flags });
        if (!sanitized.ok || !sanitized.pattern) {
            return fail(sanitized.issues, sanitized.repairs) as ValidationResult<TriggerProposal>;
        }
        repairs.push(...sanitized.repairs);
        proposal.pattern = sanitized.pattern;
        if (flags) proposal.flags = flags;
        if (input.gmcpMsgType !== undefined) {
            if (typeof input.gmcpMsgType !== 'string' || input.gmcpMsgType.trim() === '') {
                issues.push(err('wrongValueType', 'gmcpMsgType', 'Pole "gmcpMsgType" musi byc niepustym tekstem.'));
            } else {
                proposal.gmcpMsgType = input.gmcpMsgType;
            }
        }
    }

    const macros = input.macros;
    if (!Array.isArray(macros) || macros.length === 0) {
        issues.push(err('missingMacros', 'macros', 'Trigger musi miec co najmniej jedno makro (akcje do wykonania).'));
    } else {
        macros.forEach((raw, index) => {
            const result = validateMacro(raw, index, triggerType);
            issues.push(...result.issues);
            repairs.push(...result.repairs);
            commandFlags.push(...result.flags);
            if (result.macro) proposal.macros.push(result.macro);
        });
    }

    if (issues.some(i => i.severity === 'error')) {
        return fail(issues, repairs, commandFlags) as ValidationResult<TriggerProposal>;
    }

    if (typeof input.reason === 'string') proposal.reason = input.reason;
    return { ok: true, proposal, issues, repairs, commandFlags };
}

function editDistanceLocal(a: string, b: string): number {
    // Small local copy so this module does not depend on the registry export
    // order; identical to `editDistance` in settingsRegistry.
    const cols = b.length + 1;
    let prev = Array.from({ length: cols }, (_, j) => j);
    let curr = new Array<number>(cols);
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j < cols; j++) {
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        [prev, curr] = [curr, prev];
    }
    return prev[cols - 1];
}

/**
 * Key names accepted by `bindMatches`: it compares `ev.code === bind.key` or
 * `ev.key === bind.key.toLowerCase()`, so a single printable character works,
 * and so do DOM `KeyboardEvent.code` values.
 */
const KEY_CODE_SHAPE = /^(?:Key[A-Z]|Digit\d|Numpad(?:\d|Add|Subtract|Multiply|Divide|Decimal|Enter)|F(?:[1-9]|1\d|2[0-4])|Arrow(?:Up|Down|Left|Right)|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Space|Enter|Escape|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown)$/;

const NAMED_KEYS = new Set(['enter', 'escape', 'tab', 'backspace', 'delete', 'insert', 'home', 'end', 'pageup', 'pagedown', ' ']);

export function validateBind(input: Record<string, unknown>): ValidationResult<BindProposal> {
    const issues: ValidationIssue[] = [];
    const repairs: Repair[] = [];

    const key = input.key;
    if (typeof key !== 'string' || key === '') {
        issues.push(err('missingBindKey', 'key', 'Bind wymaga pola "key" (nazwa klawisza).'));
    } else if (
        key.length !== 1
        && !KEY_CODE_SHAPE.test(key)
        && !NAMED_KEYS.has(key.toLowerCase())
    ) {
        issues.push(err(
            'invalidBindKey',
            'key',
            `"${key}" nie jest rozpoznawana nazwa klawisza. Uzyj pojedynczego znaku (np. "q") albo kodu klawisza (np. "KeyQ", "Numpad1", "F5").`,
        ));
    }

    for (const modifier of ['ctrl', 'alt', 'shift'] as const) {
        const v = input[modifier];
        if (v !== undefined && typeof v !== 'boolean') {
            issues.push(err('wrongValueType', modifier, `Pole "${modifier}" musi byc true albo false.`));
        }
    }

    const safety = inspectCommand(input.command, 'command');
    issues.push(...safety.issues);

    let command = typeof input.command === 'string' ? input.command : '';
    if (command) {
        const folded = stripPolishCharacters(command);
        if (folded !== command) {
            repairs.push({
                code: 'commandFolded',
                path: 'command',
                from: command,
                to: folded,
                message: 'Usunieto polskie znaki z komendy - klient i tak wysyla ja bez nich.',
            });
            command = folded;
        }
    }

    if (issues.some(i => i.severity === 'error')) {
        return fail(issues, repairs, safety.flags) as ValidationResult<BindProposal>;
    }

    const proposal: BindProposal = { kind: 'bind', key: key as string, command };
    for (const modifier of ['ctrl', 'alt', 'shift'] as const) {
        if (input[modifier] === true) proposal[modifier] = true;
    }
    if (typeof input.reason === 'string') proposal.reason = input.reason;

    return { ok: true, proposal, issues, repairs, commandFlags: safety.flags };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

const KNOWN_KINDS: readonly ProposalKind[] = ['settingChange', 'alias', 'trigger', 'bind'];

/**
 * Validate a single proposal emitted by the model. Accepts raw `unknown`
 * because a free-tier model's JSON is not to be trusted.
 */
export function validateProposal(input: unknown): ValidationResult {
    if (!isPlainObject(input)) {
        return fail([err('invalidProposal', '', 'Propozycja musi byc obiektem JSON.')]);
    }
    const kind = input.kind;
    if (typeof kind !== 'string' || !KNOWN_KINDS.includes(kind as ProposalKind)) {
        return fail([err(
            'unknownProposalKind',
            'kind',
            `Nieznany rodzaj propozycji "${String(kind)}". Dostepne: ${KNOWN_KINDS.join(', ')}.`,
            [...KNOWN_KINDS],
        )]);
    }

    switch (kind as ProposalKind) {
        case 'settingChange': return validateSettingChange(input);
        case 'alias': return validateAlias(input);
        case 'trigger': return validateTrigger(input);
        case 'bind': return validateBind(input);
    }
}

/** Validate a batch; every proposal is judged independently. */
export function validateProposals(input: unknown): ValidationResult[] {
    if (!Array.isArray(input)) return [validateProposal(input)];
    return input.map(validateProposal);
}
