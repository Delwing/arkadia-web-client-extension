/**
 * Registry of settings keys the in-client assistant is allowed to propose.
 *
 * The assistant runs on free-tier, mid-quality LLMs, so the single most common
 * failure mode is a hallucinated settings key ("enableMap", "mapaWlaczona") or a
 * value of the wrong shape. This registry is the source of truth that turns such
 * a proposal into a hard rejection before it ever reaches a confirm card.
 *
 * It is derived from the real defaults so it cannot drift:
 * - character settings  -> `@modules/core/defaultSettings`
 * - portable UI slices  -> `@shared/settingsDefaults`
 * - stock chrome keys   -> `chromeSettingsKeys` (values live in `@web`, which
 *   `@modules` must not import at runtime, so their shapes are declared here)
 *
 * Storage scope names match the localStorage keys used by the settings
 * accessors, so a fully-qualified proposal key (`renderSettings.showTimestamps`)
 * says exactly where the value would be written.
 */

import { defaultSettings, type Settings } from '../defaultSettings';
import {
    defaultShellSettings,
    defaultRenderSettings,
    defaultMapSettings,
    defaultBehaviorSettings,
    chromeSettingsKeys,
} from '@shared/settingsDefaults';

export type SettingScope =
    | 'settings'
    | 'shellSettings'
    | 'renderSettings'
    | 'mapSettings'
    | 'behaviorSettings'
    | 'uiSettings';

export type SettingValueType =
    | 'boolean'
    | 'number'
    | 'string'
    | 'enum'
    | 'color'
    | 'stringArray'
    | 'booleanArray'
    /** Structured blobs the assistant is not allowed to author (see notes below). */
    | 'complex';

export interface SettingDescriptor {
    /** Fully-qualified key, e.g. `settings.lowHpAlert`. */
    key: string;
    scope: SettingScope;
    /** Field name inside the scope blob. */
    field: string;
    type: SettingValueType;
    /** Allowed values for `enum`. */
    enumValues?: readonly string[];
    min?: number;
    max?: number;
    integer?: boolean;
    /** Fixed length for `booleanArray`. */
    length?: number;
    /** True when the field may be absent from the stored blob. */
    optional?: boolean;
    /** Short Polish hint shown on the confirm card. */
    label?: string;
}

/**
 * Explicit constraints layered on top of the shapes inferred from the defaults.
 * Keyed by field name (field names are unique across scopes; see the duplicate
 * assertion at the bottom of this file).
 */
interface Constraint {
    type?: SettingValueType;
    enumValues?: readonly string[];
    min?: number;
    max?: number;
    integer?: boolean;
    length?: number;
    label?: string;
}

const CONSTRAINTS: Record<string, Constraint> = {
    // --- character settings -------------------------------------------------
    inlineCompassRose: { type: 'number', min: 0, max: 2, integer: true, label: 'Roza wiatrow (0 wyl., 1 inline, 2 ramka)' },
    containerColumns: { type: 'number', min: 1, max: 8, integer: true, label: 'Liczba kolumn w pojemnikach' },
    collectMode: { type: 'number', min: 0, max: 3, integer: true, label: 'Tryb zbierania lupow' },
    collectTiming: { type: 'number', min: 0, max: 3, integer: true, label: 'Moment zbierania lupow' },
    herbWieleCount: { type: 'number', min: 1, max: 200, integer: true, label: 'Ile ziol oznacza "wiele"' },
    lowHpAlert: { type: 'number', min: 0, max: 10, integer: true, label: 'Prog ostrzezenia o niskim HP' },
    letterLineWidth: { type: 'number', min: 20, max: 200, integer: true, label: 'Szerokosc linii w listach' },
    enemyBindsShowMode: { type: 'enum', enumValues: ['always', 'whenBound', 'never'] },
    enemyBindsEnabledSlots: { type: 'booleanArray', length: 3 },
    shortExitsColor: { type: 'color' },
    shortExitsBackgroundColor: { type: 'color' },
    magicsColor: { type: 'color' },
    magicKeysColor: { type: 'color' },
    guildColors: { type: 'complex' },
    zlomSilver: { type: 'complex' },
    collectOverrides: { type: 'complex' },
    languageAliases: { type: 'complex' },

    // --- render slice -------------------------------------------------------
    fontFamily: { type: 'enum', enumValues: ['default', 'fira-code', 'jetbrains-mono', 'cascadia-mono', 'custom'] },
    xtermPalette: { type: 'enum', enumValues: ['arkadia', 'proper'] },
    colorTheme: {
        type: 'enum',
        enumValues: [
            'default', 'fantasy', 'forest', 'icy', 'gray',
            'dark-neutral', 'light-parchment', 'light-silver', 'custom-dark',
        ],
    },
    customThemeColor: { type: 'color', },
    outputBackground: { type: 'color' },
    outputBottomPadding: { type: 'number', min: 0, max: 400, integer: true },
    soundCategories: { type: 'complex' },

    // --- map slice ----------------------------------------------------------
    mapRoomSize: { type: 'number', min: 0.05, max: 1 },
    mapLineWidth: { type: 'number', min: 0, max: 1 },
    mapPlayerMarkerStrokeColor: { type: 'color' },
    mapPlayerMarkerFillColor: { type: 'color' },
    mapPlayerMarkerStrokeAlpha: { type: 'number', min: 0, max: 1 },
    mapPlayerMarkerFillAlpha: { type: 'number', min: 0, max: 1 },
    mapPlayerMarkerStrokeWidth: { type: 'number', min: 0, max: 5 },
    mapPlayerMarkerSizeFactor: { type: 'number', min: 0.1, max: 10 },
    mapHighlightStrokeAlpha: { type: 'number', min: 0, max: 1 },
    mapHighlightFillAlpha: { type: 'number', min: 0, max: 1 },
    mapHighlightStrokeWidth: { type: 'number', min: 0, max: 5 },
    mapHighlightSizeFactor: { type: 'number', min: 0.1, max: 10 },
    mapHighlightShape: { type: 'enum', enumValues: ['match', 'rectangle', 'roundedRectangle', 'circle'] },
    mapRoomShape: { type: 'enum', enumValues: ['rectangle', 'circle', 'roundedRectangle'] },
    mapBackgroundColor: { type: 'color' },
    mapLineColor: { type: 'color' },
    pathFindingAlgorithm: { type: 'enum', enumValues: ['dijkstra', 'astar'] },
    labelRenderMode: { type: 'enum', enumValues: ['image', 'data', 'none'] },

    // --- behavior slice -----------------------------------------------------
    teamNumberingMode: { type: 'enum', enumValues: ['letters', 'numbers'] },
};

/**
 * Stock-chrome descriptors. `defaultChromeSettings` lives in `@web`, which
 * `@modules` must not import at runtime (the client/UI boundary rule), so the
 * shapes are declared here and cross-checked against `chromeSettingsKeys`.
 */
const CHROME_FIELDS: Record<string, Constraint & { optional?: boolean }> = {
    contentFontSize: { type: 'number', min: 0.3, max: 3, label: 'Rozmiar czcionki okna gry' },
    mapScale: { type: 'number', min: 0.05, max: 3, label: 'Powiekszenie mapy' },
    outputMaxElements: { type: 'number', min: 100, max: 100000, integer: true, label: 'Rozmiar bufora wyjscia' },
    objectsFontSize: { type: 'number', min: 0.3, max: 3 },
    buttonSize: { type: 'number', min: 0.1, max: 10, optional: true },
    showButtons: { type: 'boolean' },
    showVoiceButton: { type: 'boolean', label: 'Przycisk mikrofonu' },
    mapHeight: { type: 'number', min: 0, max: 100, integer: true, label: 'Wysokosc mapy (%)' },
    mapPosition: {
        type: 'enum',
        enumValues: [
            'top-overlay', 'bottom-overlay', 'right-overlay', 'left-overlay',
            'top', 'bottom', 'right', 'left',
        ],
    },
    footerMode: { type: 'number', min: 0, max: 3, integer: true },
    footerComponents: { type: 'complex' },
    keepMultibindsVisible: { type: 'boolean' },
    splitViewHeight: { type: 'number', min: 0, max: 100, optional: true },
    showCombatTimer: { type: 'boolean', optional: true },
    showTransportLabel: { type: 'boolean', optional: true },
    objectListBackgroundColor: { type: 'color' },
    objectListBackgroundAlpha: { type: 'number', min: 0, max: 1 },
    // Drag-and-drop reorder editors. Structurally these are just string arrays,
    // but the assistant must not author them: the generated KB classifies both
    // as `complex`, the model is told to point at the panel instead, and a
    // proposal that got this far would contradict the answer text beside it.
    // `test/shared/assistant/settingEditabilityAlignment.test.ts` keeps the two
    // classifications from drifting apart again.
    alwaysVisibleBars: { type: 'complex' },
    barOrder: { type: 'complex' },
};

/** Fields that exist on the type but are absent from the default object. */
const OPTIONAL_EXTRA_FIELDS: { scope: SettingScope; field: string }[] = [
    { scope: 'settings', field: 'shortExitsPrefix' },
    { scope: 'settings', field: 'shortExitsColor' },
    { scope: 'settings', field: 'shortExitsSeparator' },
    { scope: 'settings', field: 'shortExitsBackgroundColor' },
    { scope: 'renderSettings', field: 'customThemeColor' },
    { scope: 'renderSettings', field: 'customBeepSoundKey' },
];

function inferType(value: unknown): SettingValueType {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'string') return 'string';
    if (Array.isArray(value)) {
        if (value.every(v => typeof v === 'string')) return 'stringArray';
        if (value.length > 0 && value.every(v => typeof v === 'boolean')) return 'booleanArray';
        return 'complex';
    }
    return 'complex';
}

function describe(scope: SettingScope, field: string, defaultValue: unknown, extra?: Constraint & { optional?: boolean }): SettingDescriptor {
    const constraint = extra ?? CONSTRAINTS[field] ?? {};
    const type = constraint.type ?? inferType(defaultValue);
    return {
        key: `${scope}.${field}`,
        scope,
        field,
        type,
        enumValues: constraint.enumValues,
        min: constraint.min,
        max: constraint.max,
        integer: constraint.integer,
        length: constraint.length,
        optional: (extra as { optional?: boolean } | undefined)?.optional,
        label: constraint.label,
    };
}

function fromDefaults(scope: SettingScope, defaults: Record<string, unknown>): SettingDescriptor[] {
    return Object.keys(defaults).map(field => describe(scope, field, defaults[field]));
}

const descriptors: SettingDescriptor[] = [
    ...fromDefaults('settings', defaultSettings as unknown as Record<string, unknown>),
    ...fromDefaults('shellSettings', defaultShellSettings as unknown as Record<string, unknown>),
    ...fromDefaults('renderSettings', defaultRenderSettings as unknown as Record<string, unknown>),
    ...fromDefaults('mapSettings', defaultMapSettings as unknown as Record<string, unknown>),
    ...fromDefaults('behaviorSettings', defaultBehaviorSettings as unknown as Record<string, unknown>),
    ...chromeSettingsKeys.map(field => {
        const spec = CHROME_FIELDS[field];
        return describe('uiSettings', field, undefined, spec ?? { type: 'complex' });
    }),
];

// Optional fields missing from the default objects (`shortExitsColor` is present
// but `customThemeColor` is `undefined`, so `inferType` would call it complex).
for (const { scope, field } of OPTIONAL_EXTRA_FIELDS) {
    const existing = descriptors.find(d => d.scope === scope && d.field === field);
    if (existing) {
        existing.optional = true;
        if (existing.type === 'complex') {
            const constraint = CONSTRAINTS[field] ?? {};
            existing.type = constraint.type ?? 'string';
            existing.enumValues = constraint.enumValues;
        }
    } else {
        const d = describe(scope, field, '');
        d.optional = true;
        descriptors.push(d);
    }
}

/** Every settings key the assistant knows about, keyed by `scope.field`. */
export const SETTING_DESCRIPTORS: readonly SettingDescriptor[] = descriptors;

const byQualifiedKey = new Map<string, SettingDescriptor>();
const byField = new Map<string, SettingDescriptor[]>();
for (const d of descriptors) {
    byQualifiedKey.set(d.key.toLowerCase(), d);
    const list = byField.get(d.field.toLowerCase()) ?? [];
    list.push(d);
    byField.set(d.field.toLowerCase(), list);
}

export type SettingLookup =
    | { status: 'found'; descriptor: SettingDescriptor }
    | { status: 'ambiguous'; candidates: SettingDescriptor[] }
    | { status: 'unknown'; suggestions: string[] };

/** Levenshtein distance, used only to suggest keys after a hallucination. */
export function editDistance(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    let prev = new Array<number>(cols);
    let curr = new Array<number>(cols);
    for (let j = 0; j < cols; j++) prev[j] = j;
    for (let i = 1; i < rows; i++) {
        curr[0] = i;
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[cols - 1];
}

/** Best-effort suggestions for a key the model invented. */
export function suggestSettingKeys(key: string, limit = 3): string[] {
    const needle = key.toLowerCase().replace(/^[a-z]+\./, '');
    return descriptors
        .map(d => {
            const field = d.field.toLowerCase();
            const contains = field.includes(needle) || needle.includes(field) ? -3 : 0;
            return { key: d.key, score: editDistance(needle, field) + contains };
        })
        .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key))
        .filter(c => c.score <= Math.max(4, Math.floor(needle.length / 2)))
        .slice(0, limit)
        .map(c => c.key);
}

/**
 * Resolve a proposed key. Accepts a fully-qualified `scope.field` or a bare
 * field name when it is unambiguous (weak models routinely drop the scope).
 */
export function lookupSetting(key: unknown): SettingLookup {
    if (typeof key !== 'string' || key.trim() === '') {
        return { status: 'unknown', suggestions: [] };
    }
    const normalized = key.trim().toLowerCase();
    const qualified = byQualifiedKey.get(normalized);
    if (qualified) return { status: 'found', descriptor: qualified };

    const bare = byField.get(normalized);
    if (bare && bare.length === 1) return { status: 'found', descriptor: bare[0] };
    if (bare && bare.length > 1) return { status: 'ambiguous', candidates: bare };

    return { status: 'unknown', suggestions: suggestSettingKeys(key) };
}

/** Keys the assistant may propose (structured blobs excluded). */
export function assistantEditableKeys(): string[] {
    return descriptors.filter(d => d.type !== 'complex').map(d => d.key).sort();
}

export type { Settings };
