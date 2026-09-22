import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer, TextRange, DimEasing} from "@client/ansi/FormatState";
import {Trigger} from "../Triggers";
import {executeTriggerMacro} from "@modules/core/pluginTriggerMacroRegistry";
import { globalStorage } from "@modules/core/storage";
import { sendPush } from "@modules/push/pushClient";

export type BuiltInMacroType = 'uppercase' | 'color' | 'replace' | 'beep' | 'mute' | 'unmute' | 'command' | 'slowBlink' | 'rapidBlink' | 'dim' | 'functionalBind' | 'wrap' | 'notify' | 'push' | 'speak';

export interface UserMacro {
    type: BuiltInMacroType | string;  // string allows plugin macros like "plugin:..."
    color?: string;
    to?: string;
    command?: string;
    soundKey?: string;
    label?: string;
    message?: string;  // notify/push/speak text; empty falls back to matched text for pattern triggers
    /**
     * push only: send even if another push went out within the rate-limit
     * window. For alerts the player considers important enough that being
     * swallowed by an unrelated hp alert a moment earlier is worse than the
     * extra buzz.
     */
    bypassCooldown?: boolean;
    pluginConfig?: Record<string, any>;
    // Dim effect options
    dimStartOpacity?: number;
    dimEndOpacity?: number;
    dimDuration?: number;
    dimEasing?: DimEasing;
    // Wrap (prefix/suffix) options
    wrapPrefix?: string;
    wrapSuffix?: string;
    wrapScope?: 'match' | 'line';
}

export type TriggerType = 'pattern' | 'event';

export interface UserTrigger {
    type?: TriggerType;  // defaults to 'pattern' for backwards compatibility
    pattern?: string;    // for pattern triggers
    event?: string;      // for event triggers (e.g., 'kill', 'combatState')
    flags?: string;      // for pattern triggers only
    gmcpMsgType?: string; // limit pattern trigger to specific GMCP message type
    /** Event triggers only: every condition must hold for the macros to run. */
    conditions?: TriggerCondition[];
    macros: UserMacro[];
}

export type ConditionOperator = 'eq' | 'neq' | 'like' | 'notLike' | 'gt' | 'gte' | 'lt' | 'lte';

/** Compares one field of an event's payload (see `EventArg`) against a value. */
export interface TriggerCondition {
    arg: string;
    op: ConditionOperator;
    value: string;
}

export type EventArgType = 'number' | 'string' | 'boolean';

export interface ConditionOperatorInfo {
    id: ConditionOperator;
    label: string;
    /** Arg types this operator makes sense for. Untyped args get every operator. */
    types: EventArgType[];
}

export const CONDITION_OPERATORS: ConditionOperatorInfo[] = [
    { id: 'eq', label: 'jest', types: ['number', 'string', 'boolean'] },
    { id: 'neq', label: 'nie jest', types: ['number', 'string', 'boolean'] },
    { id: 'like', label: 'pasuje do (regex)', types: ['string'] },
    { id: 'notLike', label: 'nie pasuje do (regex)', types: ['string'] },
    { id: 'gt', label: '>', types: ['number'] },
    { id: 'gte', label: '>=', types: ['number'] },
    { id: 'lt', label: '<', types: ['number'] },
    { id: 'lte', label: '<=', types: ['number'] },
];

/** One value an event carries, offered to the user as a `{name}` placeholder. */
export interface EventArg {
    name: string;
    label: string;
    /** Decides which condition operators the editor offers for this arg. */
    type?: EventArgType;
}

export interface SupportedEvent {
    id: string;
    label: string;
    category: string;
    /**
     * When the event actually fires, shown under the picker in the editor.
     *
     * Worth writing wherever the label alone leaves it ambiguous — several of
     * these fire on a delay, or only when some other setting is enabled, and a
     * label has no room to say so. Omitted where the label is self-evident.
     */
    description?: string;
    /**
     * Values this event's payload carries. Macro text fields may reference them
     * as `{name}`; see `interpolateEventArgs`. Events without a declared list
     * simply offer no placeholders rather than offering broken ones.
     */
    args?: EventArg[];
}

export const SUPPORTED_EVENTS: SupportedEvent[] = [
    // Combat
    { id: 'kill', label: 'Zabicie (ja/druzyna)', category: 'Walka' },
    { id: 'enemyKilled', label: 'Wrog zabity', category: 'Walka' },
    { id: 'allEnemiesKilled', label: 'Wszyscy wrogowie zabici', category: 'Walka' },
    { id: 'combatState:true', label: 'Walka - start', category: 'Walka' },
    { id: 'combatState:false', label: 'Walka - koniec', category: 'Walka' },
    { id: 'enemy.paralyzed', label: 'Wrog ogluszony', category: 'Walka' },
    { id: 'enemy.paralyzed.end', label: 'Wrog - koniec ogluszenia', category: 'Walka' },
    { id: 'enemy.broken_defense', label: 'Wrog - zlamana obrona', category: 'Walka' },
    {
        id: 'enemy.attack',
        label: 'Atak wroga (ten z beepem)',
        category: 'Walka',
        description:
            'Gdy atakuje cie ktos z gildii oznaczonej jako wroga — dokladnie w tym samym momencie, w ktorym odzywa sie beep.',
        args: [{ name: 'attacker', label: 'Nazwa atakujacego', type: 'string' }],
    },

    // Character condition. These exist so the built-in alerts can be bound to a
    // `push` macro deliberately — nothing reaches a paired device on its own.
    {
        id: 'hp.low',
        label: 'Niskie zycie',
        category: 'Postac',
        description:
            'Gdy kondycja spadnie do progu ustawionego w "Alarm niskiego zdrowia" (Opcje → Ustawienia).',
        args: [
            { name: 'text', label: 'Opis kondycji', type: 'string' },
            { name: 'hp', label: 'Poziom zycia (GMCP)', type: 'number' },
        ],
    },
    {
        id: 'hp.full',
        label: 'Pelne zycie (3 min bez walki)',
        category: 'Postac',
        description:
            '3 minuty po odzyskaniu pelnego zycia, o ile w tym czasie zycie nie spadlo i nie atakowales. '
            + 'Wymaga wlaczonej opcji "Informacja o pelnym zdrowiu" — bez niej nie zadziala wcale.',
        args: [{ name: 'text', label: 'Tresc alertu', type: 'string' }],
    },
    {
        id: 'hp.idleFull',
        label: 'Pelne zycie po bezczynnosci',
        category: 'Postac',
        description:
            'W chwili odzyskania pelnego zycia, jesli przez ostatnie 2 minuty nie wyslales zadnej komendy. '
            + 'To zdarzenie do powiadomien "wrocilem, jestem wyleczony".',
        args: [{ name: 'text', label: 'Tresc alertu', type: 'string' }],
    },

    // Connection
    { id: 'client.connect', label: 'Polaczenie', category: 'Polaczenie' },
    { id: 'client.disconnect', label: 'Rozlaczenie', category: 'Polaczenie' },

    // Timers
    { id: 'zaskTimer', label: 'Timer zaskoczenia', category: 'Timery' },
    { id: 'coverTimer', label: 'Timer oslony', category: 'Timery' },
    { id: 'transportTimer', label: 'Timer transportu', category: 'Timery' },

    // Raw GMCP packages, fired as `gmcp.<package>` for every message the server
    // sends. The editor collapses this category into a single "GMCP" choice
    // with its own package picker (see GMCP_EVENT_CATEGORY).
    {
        id: 'gmcp.char.state',
        label: 'Char.State — stan postaci',
        category: 'GMCP',
        description: 'Przy kazdej zmianie stanu postaci (zycie, zmeczenie, mana, obciazenie...). Przychodzi bardzo czesto.',
        args: [
            { name: 'hp', label: 'Zycie', type: 'number' },
            { name: 'mana', label: 'Mana', type: 'number' },
            { name: 'fatigue', label: 'Zmeczenie', type: 'number' },
            { name: 'improve', label: 'Postepy', type: 'number' },
            { name: 'form', label: 'Forma', type: 'number' },
            { name: 'intox', label: 'Upojenie', type: 'number' },
            { name: 'headache', label: 'Kac', type: 'number' },
            { name: 'stuffed', label: 'Najedzenie', type: 'number' },
            { name: 'soaked', label: 'Napojenie', type: 'number' },
            { name: 'encumbrance', label: 'Obciazenie', type: 'number' },
            { name: 'panic', label: 'Panika', type: 'number' },
            { name: 'state', label: 'Stan', type: 'string' },
        ],
    },
    {
        id: 'gmcp.char.info',
        label: 'Char.Info — informacje o postaci',
        category: 'GMCP',
        description: 'Po zalogowaniu i przy zmianie danych postaci.',
        args: [
            { name: 'name', label: 'Imie', type: 'string' },
            { name: 'race', label: 'Rasa', type: 'string' },
            { name: 'gender', label: 'Plec', type: 'string' },
            { name: 'guild_occ', label: 'Gildia zawodowa', type: 'string' },
            { name: 'guild_lay', label: 'Gildia laicka', type: 'string' },
            { name: 'guild_race', label: 'Gildia rasowa', type: 'string' },
            { name: 'guild_rel', label: 'Gildia religijna', type: 'string' },
        ],
    },
    {
        id: 'gmcp.char.options',
        label: 'Char.Options — opcje postaci',
        category: 'GMCP',
        description: 'Po zalogowaniu i przy zmianie opcji. Serwer moze wyslac tylko zmieniona opcje.',
    },
    { id: 'gmcp.char.options.info', label: 'Char.Options.Info — dozwolone wartosci opcji', category: 'GMCP' },
    { id: 'gmcp.char.colors', label: 'Char.Colors — kolory', category: 'GMCP' },
    {
        id: 'gmcp.room.info',
        label: 'Room.Info — lokacja',
        category: 'GMCP',
        description: 'Przy kazdym wejsciu na lokacje.',
        args: [
            { name: 'num', label: 'Numer lokacji', type: 'number' },
            { name: 'id', label: 'Identyfikator lokacji', type: 'number' },
            { name: 'hash', label: 'Hash lokacji', type: 'string' },
            { name: 'exits', label: 'Wyjscia', type: 'string' },
        ],
    },
    {
        id: 'gmcp.room.time',
        label: 'Room.Time — pora dnia',
        category: 'GMCP',
        args: [
            { name: 'daylight', label: 'Dzien', type: 'boolean' },
            { name: 'season', label: 'Pora roku', type: 'number' },
        ],
    },
    {
        id: 'gmcp.mail.state',
        label: 'Mail.State — poczta',
        category: 'GMCP',
        args: [
            { name: 'unread', label: 'Nieprzeczytane', type: 'boolean' },
            { name: 'unreceived', label: 'Nieodebrane', type: 'boolean' },
            { name: 'unsent', label: 'Niewyslane', type: 'boolean' },
        ],
    },
    {
        id: 'gmcp.objects.nums',
        label: 'Objects.Nums — obiekty wokol',
        category: 'GMCP',
        description: 'Przy kazdej zmianie listy obiektow na lokacji.',
    },
    {
        id: 'gmcp.objects.data',
        label: 'Objects.Data — dane obiektow',
        category: 'GMCP',
        description: 'Przy kazdej zmianie stanu obiektow wokol (np. w trakcie walki). Przychodzi bardzo czesto.',
    },
    { id: 'gmcp.core.ping', label: 'Core.Ping — odpowiedz na ping', category: 'GMCP' },
];

/** Category of the raw GMCP entries in `SUPPORTED_EVENTS`. */
export const GMCP_EVENT_CATEGORY = 'GMCP';

const STORAGE_KEY = 'triggers';

/**
 * Replace `{0}`, `{1}`… and `{name}` in a pattern trigger's macro text with
 * the regex match's groups. Like `interpolateEventArgs`, a placeholder with no
 * such group — or one that did not participate in the match — is left standing.
 */
export function interpolateMatchGroups(text: string, match: RegExpMatchArray): string {
    if (!text || !text.includes('{')) return text;

    return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*|\d+)\}/g, (whole, name: string) => {
        const value = /^\d+$/.test(name) ? match[Number(name)] : match.groups?.[name];
        return value === undefined ? whole : value;
    });
}

function applyMacrosToMatch(
    client: Client,
    line: AnsiAwareBuffer,
    match: RegExpMatchArray,
    macros: UserMacro[]
): void {
    const matchStart = match.index ?? 0;
    let matchRange: TextRange = [matchStart, matchStart + match[0].length];

    macros?.forEach(macro => {
        switch (macro.type) {
            case 'uppercase':
                line.replace(matchRange, line.text.substring(matchRange[0], matchRange[1]).toUpperCase());
                break;
            case 'color':
                if (macro.color) {
                    const color = createColorFormat(macro.color);
                    line.applyFormat(matchRange, color);
                }
                break;
            case 'replace':
                const replacement = macro.to || '';
                line.replace(matchRange, replacement);
                matchRange = [matchRange[0], matchRange[0] + replacement.length];
                break;
            case 'beep':
                client.sendEvent("sound:play", {key: macro.soundKey || "beep"});
                break;
            case 'mute':
                client.SoundManager.mute();
                break;
            case 'unmute':
                client.SoundManager.unmute();
                break;
            case 'command':
                if (macro.command) {
                    client.sendCommand(macro.command);
                }
                break;
            case 'slowBlink':
                line.applyFormat(matchRange, { slowBlink: true });
                break;
            case 'rapidBlink':
                line.applyFormat(matchRange, { rapidBlink: true });
                break;
            case 'dim':
                line.applyFormat(matchRange, {
                    dim: {
                        startOpacity: macro.dimStartOpacity ?? 1,
                        endOpacity: macro.dimEndOpacity ?? 0.3,
                        duration: macro.dimDuration ?? 1000,
                        easing: macro.dimEasing,
                    }
                });
                break;
            case 'wrap': {
                const prefix = macro.wrapPrefix || '';
                const suffix = macro.wrapSuffix || '';
                if (macro.wrapScope === 'line') {
                    if (suffix) line.insert(line.length, suffix);
                    if (prefix) line.insert(0, prefix);
                    matchRange = [matchRange[0] + prefix.length, matchRange[1] + prefix.length];
                } else {
                    if (suffix) line.insert(matchRange[1], suffix);
                    if (prefix) line.insert(matchRange[0], prefix);
                    matchRange = [matchRange[0], matchRange[1] + prefix.length + suffix.length];
                }
                break;
            }
            case 'functionalBind':
                if (macro.command && macro.label) {
                    client.FunctionalBind.set(macro.label, () => {
                        client.sendCommand(macro.command!);
                    });
                }
                break;
            case 'notify': {
                const text = macro.message || line.text.substring(matchRange[0], matchRange[1]);
                client.sendEvent("notify", { text, system: true });
                break;
            }
            case 'push': {
                const text = macro.message || line.text.substring(matchRange[0], matchRange[1]);
                // Unlike the automatic hp alert, this is sent whether or not the
                // client is on screen: a trigger the player wrote deliberately
                // should not silently do nothing while they are at the desk.
                void sendPush(
                    { title: 'Arkadia', body: text },
                    { bypassCooldown: macro.bypassCooldown },
                );
                break;
            }
            case 'speak': {
                const text = macro.message
                    ? interpolateMatchGroups(macro.message, match)
                    : line.text.substring(matchRange[0], matchRange[1]);
                if (text.trim()) {
                    client.sendEvent("tts:speak", { text });
                }
                break;
            }
            default:
                // Handle plugin trigger macros
                if (macro.type.startsWith('plugin:')) {
                    executeTriggerMacro(macro.type, {
                        client,
                        line,
                        match,
                        matchRange,
                    }, macro.pluginConfig || {});
                }
                break;
        }
    });
}

/**
 * Replace `{name}` placeholders in a macro's text with values from the event.
 *
 * An unknown or absent placeholder is left standing rather than blanked: a
 * literal `{attacker}` arriving on the phone tells the player their reference
 * is wrong, where an empty string would just look like the event misfired.
 *
 * A payload that is not an object (several events emit a bare string or
 * boolean) exposes that value as `{value}`.
 */
export function interpolateEventArgs(text: string, payload: unknown): string {
    if (!text || !text.includes('{')) return text;

    const source = eventPayloadFields(payload);

    return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) => {
        const value = source[name];
        return value === undefined || value === null ? whole : String(value);
    });
}

/** An event's payload as named fields; a bare (non-object) payload is `value`. */
function eventPayloadFields(payload: unknown): Record<string, unknown> {
    return typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : { value: payload };
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    const n = Number(value.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Whether the event payload satisfies one condition.
 *
 * A field the payload does not carry fails every operator, `neq` included.
 * Several events arrive partial (Char.State only sends what changed), and
 * "hp is not 10" must not fire on every mana update that omits hp.
 *
 * `eq`/`neq` compare numerically when both sides are numbers, otherwise as
 * text ignoring case. `like`/`notLike` take a case-insensitive regex; one that
 * does not compile fails the condition either way.
 */
export function evaluateCondition(condition: TriggerCondition, payload: unknown): boolean {
    const actual = eventPayloadFields(payload)[condition.arg];
    if (actual === undefined || actual === null) return false;

    const expected = condition.value ?? '';
    const actualNumber = asNumber(actual);
    const expectedNumber = asNumber(expected);

    const equals = () =>
        actualNumber !== undefined && expectedNumber !== undefined
            ? actualNumber === expectedNumber
            : String(actual).toLowerCase() === expected.trim().toLowerCase();

    const likes = (): boolean | undefined => {
        try {
            return new RegExp(expected, 'i').test(String(actual));
        } catch {
            return undefined;
        }
    };

    const compare = (fn: (a: number, b: number) => boolean) =>
        actualNumber !== undefined && expectedNumber !== undefined && fn(actualNumber, expectedNumber);

    switch (condition.op) {
        case 'eq': return equals();
        case 'neq': return !equals();
        case 'like': return likes() === true;
        case 'notLike': return likes() === false;
        case 'gt': return compare((a, b) => a > b);
        case 'gte': return compare((a, b) => a >= b);
        case 'lt': return compare((a, b) => a < b);
        case 'lte': return compare((a, b) => a <= b);
        default: return false;
    }
}

function applyEventMacros(
    client: Client,
    macros: UserMacro[],
    payload?: unknown
): void {
    macros?.forEach(macro => {
        // Every user-authored text field on an event macro supports {name}
        // placeholders drawn from the event payload.
        const command = macro.command && interpolateEventArgs(macro.command, payload);
        const label = macro.label && interpolateEventArgs(macro.label, payload);
        const message = macro.message && interpolateEventArgs(macro.message, payload);

        switch (macro.type) {
            case 'beep':
                client.sendEvent("sound:play", {key: macro.soundKey || "beep"});
                break;
            case 'mute':
                client.SoundManager.mute();
                break;
            case 'unmute':
                client.SoundManager.unmute();
                break;
            case 'command':
                if (command) {
                    client.sendCommand(command);
                }
                break;
            case 'functionalBind':
                if (command && label) {
                    client.FunctionalBind.set(label, () => {
                        client.sendCommand(command);
                    });
                }
                break;
            case 'notify':
                if (message) {
                    client.sendEvent("notify", { text: message, system: true });
                }
                break;
            case 'push':
                // No matched text to fall back on for an event trigger, so a
                // message is required rather than optional.
                if (message) {
                    void sendPush(
                        { title: 'Arkadia', body: message },
                        { bypassCooldown: macro.bypassCooldown },
                    );
                }
                break;
            case 'speak':
                // As with push, nothing to fall back on without a matched line.
                if (message?.trim()) {
                    client.sendEvent("tts:speak", { text: message });
                }
                break;
            // Note: Plugin macros are not supported for event triggers
            // because they require text context (line, match, matchRange)
        }
    });
}

type EventHandler = { event: string; handler: (data: unknown) => void };

export default function initUserTriggers(client: Client) {
    let registeredPatternTriggers: Trigger[] = [];
    let registeredEventHandlers: EventHandler[] = [];

    const apply = (list: UserTrigger[] = []) => {
        // Clean up pattern triggers
        registeredPatternTriggers.forEach(t => client.Triggers.removeTrigger(t));
        registeredPatternTriggers = [];

        // Clean up event handlers
        registeredEventHandlers.forEach(({ event, handler }) => {
            client.off(event as any, handler);
        });
        registeredEventHandlers = [];

        // Process each trigger
        list.forEach(item => {
            const triggerType = item.type || 'pattern';

            if (triggerType === 'event' && item.event) {
                // Event-based trigger
                const [eventName, eventValue] = item.event.split(':');

                const handler = (data: unknown) => {
                    // For events like 'combatState:true', check the value
                    if (eventValue !== undefined) {
                        if (String(data) !== eventValue) return;
                    }
                    if (item.conditions?.some(c => c.arg && !evaluateCondition(c, data))) return;
                    applyEventMacros(client, item.macros, data);
                };

                client.on(eventName as any, handler);
                registeredEventHandlers.push({ event: eventName, handler });
            } else if (item.pattern) {
                // Pattern-based trigger
                const flags = item.flags || '';
                const hasGlobalFlag = flags.includes('g');
                const hasCaseInsensitiveFlag = flags.includes('i');
                const hasMultilineFlag = flags.includes('m');

                // Build regexp flags without 'i' (handled by TriggerOptions) and without 'm' (handled by trigger type)
                const regexpFlags = hasGlobalFlag ? 'g' : '';

                let regexp: RegExp;
                try {
                    regexp = new RegExp(item.pattern, regexpFlags);
                } catch (e) {
                    console.error('Invalid trigger pattern', item.pattern, item.flags, e);
                    return;
                }

                const callback = (line: AnsiAwareBuffer, matches: RegExpMatchArray, type: string) => {
                    if (item.gmcpMsgType && type !== item.gmcpMsgType) return line;
                    if (hasGlobalFlag) {
                        // For global flag, find all matches and apply macros to each
                        const globalRegexp = new RegExp(item.pattern!, 'g' + (hasCaseInsensitiveFlag ? 'i' : ''));
                        let match: RegExpExecArray | null;
                        const allMatches: RegExpExecArray[] = [];

                        while ((match = globalRegexp.exec(line.text)) !== null) {
                            allMatches.push(match);
                            if (match[0].length === 0) {
                                globalRegexp.lastIndex++;
                            }
                        }

                        // Apply in reverse order to preserve indices
                        for (let i = allMatches.length - 1; i >= 0; i--) {
                            applyMacrosToMatch(client, line, allMatches[i], item.macros);
                        }
                    } else {
                        applyMacrosToMatch(client, line, matches, item.macros);
                    }
                    return line;
                };

                const trigger = hasMultilineFlag
                    ? client.Triggers.registerMultilineTrigger(regexp, callback, STORAGE_KEY, { caseInsensitive: hasCaseInsensitiveFlag })
                    : client.Triggers.registerTrigger(regexp, callback, STORAGE_KEY, { caseInsensitive: hasCaseInsensitiveFlag });

                registeredPatternTriggers.push(trigger);
            }
        });
    };

    const initialTriggers = globalStorage.get(STORAGE_KEY);
    if (initialTriggers) apply(Array.isArray(initialTriggers) ? initialTriggers : []);

    globalStorage.onChange(STORAGE_KEY, (newValue) => {
        apply(Array.isArray(newValue) ? newValue : []);
    });
}
