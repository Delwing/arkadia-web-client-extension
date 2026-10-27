import { globalStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";
import { ButtonMacroConfig, MobileButtonSetting, defaultFontColor } from "./buttonSettings";
import { createDefaultJoysticks, parseJoystickSettings, type JoystickSettings } from "./joystickSettings";
import {
    BUTTON_MODES,
    DEFAULT_ACTIVE_COLOR,
    DEFAULT_BUTTON_COLOR,
    DEFAULT_DIRECTION_COLOR,
    type ButtonMode,
    type ButtonModes,
    type GridLayout,
    type MobileButtonStyle,
    type ModeConfig,
    type StoredMobileButton,
} from "./mobileButtons/model";
import { resolveMode } from "./mobileButtons/resolve";
import { canonical, modesFromLayouts } from "./mobileButtons/migrateV1";

export interface RadialCommandSetting {
    id: string;
    label: string;
    command: string;
    color?: string;
    activeColor?: string;
    fontColor?: string;
}

export interface RadialSettings {
    enabled: boolean;
    commands: RadialCommandSetting[];
}

export const defaultBackground = 'rgba(135, 206, 235, 0.7)';

export const defaultButtonSize = 36;

export const defaultButtonGap = 10;

export const defaultSettings: Record<string, MobileButtonSetting> = {
    // top row buttons
    'z-list-toggle': { macroType: 'zList', label: '/z', color: DEFAULT_BUTTON_COLOR, fontColor: defaultFontColor },
    'zas-list-toggle': { macroType: 'zaList', label: '/za', color: DEFAULT_BUTTON_COLOR, fontColor: defaultFontColor },
    'go-button': { macroType: 'command', label: '/go', color: DEFAULT_BUTTON_COLOR, fontColor: defaultFontColor, command: '/go' },
    'buttons-toggle': { macroType: 'toggleButtons', label: '⇩', color: DEFAULT_BUTTON_COLOR, fontColor: defaultFontColor },
    'bracket-right-button': { macroType: 'functional', label: ']', color: DEFAULT_BUTTON_COLOR, fontColor: defaultFontColor },
    'button-1': { macroType: 'wesprzyj', label: 'wesprzyj', color: DEFAULT_BUTTON_COLOR, fontColor: defaultFontColor },
    'button-2': { macroType: 'command', label: '/z cel', color: DEFAULT_BUTTON_COLOR, fontColor: defaultFontColor, command: '/z' },
    'button-3': { macroType: 'command', label: '/za cel', color: DEFAULT_BUTTON_COLOR, fontColor: defaultFontColor, command: '/za' },

    // direction buttons in visual order
    'nw-button': {
        macroType: 'kierunek',
        label: '↖',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'nw',
        direction: 'nw',
    },
    'n-button': {
        macroType: 'kierunek',
        label: '↑',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'n',
        direction: 'n',
    },
    'ne-button': {
        macroType: 'kierunek',
        label: '↗',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'ne',
        direction: 'ne',
    },
    'u-button': {
        macroType: 'kierunek',
        label: 'u',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'u',
        direction: 'u',
    },
    'w-button': {
        macroType: 'kierunek',
        label: '←',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'w',
        direction: 'w',
    },
    'c-button': { macroType: 'zerknij', label: 'zerknij', color: DEFAULT_DIRECTION_COLOR, fontColor: defaultFontColor },
    'e-button': {
        macroType: 'kierunek',
        label: '→',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'e',
        direction: 'e',
    },
    'd-button': {
        macroType: 'kierunek',
        label: 'd',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'd',
        direction: 'd',
    },
    'sw-button': {
        macroType: 'kierunek',
        label: '↙',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'sw',
        direction: 'sw',
    },
    's-button': {
        macroType: 'kierunek',
        label: '↓',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 's',
        direction: 's',
    },
    'se-button': {
        macroType: 'kierunek',
        label: '↘',
        color: DEFAULT_DIRECTION_COLOR,
        activeColor: DEFAULT_ACTIVE_COLOR,
        fontColor: defaultFontColor,
        command: 'se',
        direction: 'se',
    },
    'special-exit-button': { macroType: 'specialExit', label: 'sp ex', color: DEFAULT_DIRECTION_COLOR, fontColor: defaultFontColor },
};

export const defaultOrder = [
    'z-list-toggle',
    'zas-list-toggle',
    'go-button',
    'buttons-toggle',
    'bracket-right-button',
    'button-1',
    'button-2',
    'button-3',
    'nw-button',
    'n-button',
    'ne-button',
    'u-button',
    'w-button',
    'c-button',
    'e-button',
    'd-button',
    'sw-button',
    's-button',
    'se-button',
    'special-exit-button',
];

export const defaultCols = 4;

export interface LayoutSettings {
    buttons: Record<string, MobileButtonSetting>;
    order: string[];
    cols: number;
    background: string;
}

/** The v1 stored shape: three independent layouts. Still read (migration) and written (mirror). */
export interface LegacySettings {
    solo: LayoutSettings;
    team: LayoutSettings;
    leader: LayoutSettings;
    locked: boolean;
    radial: RadialSettings;
    joysticks: JoystickSettings;
    buttonSize?: number;   // Size in pixels (default 36)
    buttonGap?: number;    // Gap between buttons in pixels (default 2)
}

/**
 * The v2 stored shape (docs/dev/MOBILE_BUTTONS_V2.md). `modes`/`styles` are
 * the source of truth; `solo`/`team`/`leader` are each mode resolved into the
 * v1 layout shape. They are what the renderer and the current editor read,
 * and they are written to storage too so clients still on v1 keep showing the
 * right buttons. An editor that changes them instead of `modes` is honoured on
 * save (see `saveSettings`).
 */
export interface Settings extends LegacySettings, ButtonModes {
    version: 2;
}

export function createDefaultLayout(): LayoutSettings {
    return { buttons: { ...defaultSettings }, order: [...defaultOrder], cols: defaultCols, background: defaultBackground };
}

const emptyButton: MobileButtonSetting = { macroType: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor };

const defaultRadialSettings: RadialSettings = {
    enabled: true,
    commands: [
        { id: 'radial-1', label: 'dobadz broni', command: 'dobadz wszystkich broni' },
        { id: 'radial-2', label: 'buduj zioła', command: '/ziola_buduj' },
        { id: 'radial-3', label: 'deliona', command: '/zi zjedz deliona' },
        { id: 'radial-5', label: '/list', command: '/list' },
        { id: 'radial-6', label: 'otul', command: 'otul sie plaszczem' },
        { id: 'radial-4', label: '+k', command: '+k' },
    ],
};

function cloneDefaultRadialCommands(): RadialCommandSetting[] {
    return defaultRadialSettings.commands.map(cmd => ({ ...cmd }));
}

function parseSteps(raw: unknown): ButtonMacroConfig[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const steps: ButtonMacroConfig[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const macroType = typeof entry.macroType === 'string' ? entry.macroType
            : typeof entry.macro === 'string' ? entry.macro : '';
        if (!macroType || macroType === 'compound') continue; // prevent nesting
        const step: ButtonMacroConfig = { macroType };
        if (typeof entry.command === 'string') step.command = entry.command;
        if (typeof entry.direction === 'string') step.direction = entry.direction;
        if (typeof entry.enemySlot === 'number') step.enemySlot = entry.enemySlot;
        if (typeof entry.exitIndex === 'number') step.exitIndex = entry.exitIndex;
        if (entry.pluginConfig && typeof entry.pluginConfig === 'object') {
            step.pluginConfig = entry.pluginConfig as Record<string, any>;
        }
        steps.push(step);
    }
    return steps.length > 0 ? steps : undefined;
}

function extractButtons(set: any): Record<string, MobileButtonSetting> {
    if (!set || typeof set !== 'object') {
        return {};
    }
    const candidate = set.buttons && typeof set.buttons === 'object' ? set.buttons : set;
    const result: Record<string, MobileButtonSetting> = {};
    Object.keys(candidate).forEach(key => {
        if (['order', 'cols', 'background'].includes(key)) {
            return;
        }
        const value = candidate[key];
        if (value && typeof value === 'object') {
            result[key] = value as MobileButtonSetting;
        }
    });
    return result;
}

function mergeMobileButtonSettings(buttons: Record<string, MobileButtonSetting>): Record<string, MobileButtonSetting> {
    const merged: Record<string, MobileButtonSetting> = {};
    const keys = new Set([...Object.keys(defaultSettings), ...Object.keys(buttons || {})]);
    keys.forEach(id => {
        const base = defaultSettings[id] || emptyButton;
        const override = (buttons && buttons[id]) || {} as any;
        // Migrate old macro field to macroType
        if (typeof override.macro === 'string' && typeof override.macroType !== 'string') {
            override.macroType = override.macro;
            delete override.macro;
        }
        const cfg: MobileButtonSetting = { ...base, ...override };
        cfg.fontColor = cfg.fontColor || base.fontColor || defaultFontColor;
        if (cfg.macroType === 'compound') {
            cfg.steps = parseSteps((override as any).steps);
        }
        // Migrate hold.macro → hold.macroType
        if (cfg.hold && typeof (cfg.hold as any).macro === 'string' && typeof cfg.hold.macroType !== 'string') {
            cfg.hold = { ...cfg.hold, macroType: (cfg.hold as any).macro };
            delete (cfg.hold as any).macro;
        }
        merged[id] = cfg;
    });
    return merged;
}

function parseLayout(set: any, fallback: LayoutSettings = createDefaultLayout()): LayoutSettings {
    const buttons = mergeMobileButtonSettings(extractButtons(set));
    const order = Array.isArray(set?.order) ? set.order : [...fallback.order];
    const cols = typeof set?.cols === 'number' && set.cols > 0 ? set.cols : fallback.cols;
    const background = typeof set?.background === 'string' && set.background ? set.background : fallback.background;
    return { buttons, order, cols, background };
}

function parseRadialSettings(raw: any): RadialSettings {
    if (!raw || typeof raw !== 'object') {
        return { enabled: true, commands: cloneDefaultRadialCommands() };
    }
    const enabled = raw.enabled !== false;
    const list = Array.isArray(raw.commands) ? raw.commands : [];
    const commands: RadialCommandSetting[] = [];
    const usedIds = new Set<string>();
    list.forEach((entry: any, index: number) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }
        const command = typeof entry.command === 'string' ? entry.command.trim() : '';
        if (!command) {
            return;
        }
        const labelRaw = typeof entry.label === 'string' ? entry.label.trim() : '';
        const label = labelRaw || command;
        let id = typeof entry.id === 'string' && entry.id ? entry.id : `radial-${index + 1}`;
        while (usedIds.has(id)) {
            id = `${id}-${commands.length + 1}`;
        }
        usedIds.add(id);
        const color = typeof entry.color === 'string' && entry.color ? entry.color : undefined;
        const activeColor = typeof entry.activeColor === 'string' && entry.activeColor ? entry.activeColor : undefined;
        const fontColor = typeof entry.fontColor === 'string' && entry.fontColor ? entry.fontColor : undefined;
        commands.push({ id, label, command, color, activeColor, fontColor });
    });
    if (!commands.length) {
        return { enabled, commands: cloneDefaultRadialCommands() };
    }
    return { enabled, commands };
}

/** Parse a stored v1 value; anything unrecognised gives the defaults. */
export function parseLegacySettings(raw: any): LegacySettings {
    try {
        if (raw) {
            const locked = !!raw.locked;
            const buttonSize = typeof raw.buttonSize === 'number' && raw.buttonSize > 0 ? raw.buttonSize : defaultButtonSize;
            const buttonGap = typeof raw.buttonGap === 'number' && raw.buttonGap >= 0 ? raw.buttonGap : defaultButtonGap;
            if (raw.solo && raw.team && raw.leader && (raw.solo.buttons || raw.team.buttons || raw.leader.buttons)) {
                return {
                    solo: parseLayout(raw.solo),
                    team: parseLayout(raw.team),
                    leader: parseLayout(raw.leader),
                    locked,
                    radial: parseRadialSettings(raw.radial),
                    joysticks: parseJoystickSettings(raw.joysticks, locked),
                    buttonSize,
                    buttonGap,
                };
            }
            const order = Array.isArray(raw.order) ? raw.order : [...defaultOrder];
            const cols = typeof raw.cols === 'number' && raw.cols > 0 ? raw.cols : defaultCols;
            const soloBackground = typeof raw?.solo?.background === 'string' && raw.solo.background
                ? raw.solo.background
                : defaultBackground;
            const teamBackground = typeof raw?.team?.background === 'string' && raw.team.background
                ? raw.team.background
                : typeof raw?.solo?.background === 'string' && raw.solo.background
                    ? raw.solo.background
                    : defaultBackground;
            const leaderBackground = typeof raw?.leader?.background === 'string' && raw.leader.background
                ? raw.leader.background
                : typeof raw?.team?.background === 'string' && raw.team.background
                    ? raw.team.background
                    : typeof raw?.solo?.background === 'string' && raw.solo.background
                        ? raw.solo.background
                        : defaultBackground;
            return {
                solo: {
                    buttons: mergeMobileButtonSettings(extractButtons(raw.solo)),
                    order: [...order],
                    cols,
                    background: soloBackground,
                },
                team: {
                    buttons: mergeMobileButtonSettings(extractButtons(raw.team || raw.solo)),
                    order: [...order],
                    cols,
                    background: teamBackground,
                },
                leader: {
                    buttons: mergeMobileButtonSettings(extractButtons(raw.leader || raw.team || raw.solo)),
                    order: [...order],
                    cols,
                    background: leaderBackground,
                },
                locked,
                radial: parseRadialSettings(raw.radial),
                joysticks: parseJoystickSettings(raw.joysticks, locked),
                buttonSize,
                buttonGap,
            };
        }
    } catch {}
    return {
        solo: createDefaultLayout(),
        team: createDefaultLayout(),
        leader: createDefaultLayout(),
        locked: false,
        radial: { enabled: true, commands: cloneDefaultRadialCommands() },
        joysticks: createDefaultJoysticks(),
        buttonSize: defaultButtonSize,
        buttonGap: defaultButtonGap,
    };
}

function isGridLayout(value: any): value is GridLayout {
    return !!value && typeof value === 'object'
        && typeof value.cols === 'number' && value.cols > 0
        && Array.isArray(value.order) && value.order.every((id: unknown) => typeof id === 'string');
}

/** The v2 part of a stored value, or null when it isn't (valid) v2. */
function parseButtonModes(raw: any): ButtonModes | null {
    if (!raw || raw.version !== 2 || !raw.modes || typeof raw.modes !== 'object') return null;

    const styles: Record<string, MobileButtonStyle> = {};
    for (const [id, style] of Object.entries<any>(raw.styles && typeof raw.styles === 'object' ? raw.styles : {})) {
        if (!style || typeof style.color !== 'string') continue;
        styles[id] = {
            name: typeof style.name === 'string' ? style.name : id,
            color: style.color,
            fontColor: typeof style.fontColor === 'string' && style.fontColor ? style.fontColor : defaultFontColor,
            activeColor: typeof style.activeColor === 'string' && style.activeColor ? style.activeColor : DEFAULT_ACTIVE_COLOR,
        };
    }
    const ordered = Array.isArray(raw.styleOrder) ? raw.styleOrder.filter((id: unknown) => typeof id === 'string' && styles[id as string]) : [];
    const styleOrder: string[] = [...new Set<string>([...ordered, ...Object.keys(styles)])];
    if (styleOrder.length === 0) return null;

    const modes = {} as Record<ButtonMode, ModeConfig>;
    for (const mode of BUTTON_MODES) {
        const stored = raw.modes[mode];
        const buttons: Record<string, StoredMobileButton> = {};
        for (const [id, button] of Object.entries<any>(stored?.buttons && typeof stored.buttons === 'object' ? stored.buttons : {})) {
            if (!button || typeof button !== 'object' || typeof button.macroType !== 'string') continue;
            buttons[id] = { ...button, label: typeof button.label === 'string' ? button.label : '' };
        }
        const config: ModeConfig = { buttons };
        if (isGridLayout(stored?.layout)) config.layout = { cols: stored.layout.cols, order: [...stored.layout.order] };
        if (typeof stored?.background === 'string' && stored.background) config.background = stored.background;
        modes[mode] = config;
    }
    if (!modes.solo.layout) return null;
    modes.solo.background ??= defaultBackground;
    return { modes, styles, styleOrder };
}

/** Recompute the per-mode views; an editor working on `modes` calls this after each change. */
export function withViews(base: Omit<Settings, ButtonMode>): Settings {
    return {
        ...base,
        solo: resolveMode(base, 'solo'),
        team: resolveMode(base, 'team'),
        leader: resolveMode(base, 'leader'),
    };
}

function sharedSettings(raw: any, legacy: LegacySettings) {
    return {
        locked: legacy.locked,
        radial: raw?.radial && typeof raw.radial === 'object' ? raw.radial : legacy.radial,
        joysticks: raw?.joysticks && typeof raw.joysticks === 'object' ? raw.joysticks : legacy.joysticks,
        buttonSize: legacy.buttonSize,
        buttonGap: legacy.buttonGap,
    };
}

/**
 * Any stored value — v2, v1 (from an old client, a backup or a peer that
 * synced before migrating) or garbage — as v2 settings with resolved views.
 */
export function parseSettings(raw: any): Settings {
    const legacy = parseLegacySettings(raw);
    const modes = parseButtonModes(raw) ?? modesFromLayouts(legacy);
    return withViews({ version: 2, ...sharedSettings(raw, legacy), ...modes });
}

/** Solo back to the stock layout, reusing `existing` styles whose colours match. */
export function defaultSoloModes(existing: ButtonModes): ButtonModes {
    const stock = createDefaultLayout();
    return modesFromLayouts({ solo: stock, team: stock, leader: stock }, existing);
}

export function loadSettings(): Settings {
    return parseSettings(globalStorage.get('mobileButtonSettings'));
}

/**
 * Store settings as v2 plus the resolved per-mode views. When a caller edited
 * the views rather than `modes` (the current editor, a v1 object from a
 * device bundle), the modes are re-derived from the views, keeping the
 * existing styles where the colours still match.
 */
export function saveSettings(settings: Settings | LegacySettings) {
    const raw = settings as any;
    const legacy = parseLegacySettings(raw);
    const current = parseButtonModes(raw);
    const viewsEdited = !!current && BUTTON_MODES.some(mode => canonical(raw[mode]) !== canonical(resolveMode(current, mode)));
    const modes = current && !viewsEdited ? current : modesFromLayouts(legacy, current ?? undefined);
    globalStorage.set('mobileButtonSettings', withViews({ version: 2, ...sharedSettings(raw, legacy), ...modes }));
}

/** Raw copy of the last v1 value, taken once before the first v2 write; local only, not synced. */
export const MOBILE_BUTTONS_V1_BACKUP_KEY = 'mobileButtonSettingsV1Backup';

/** Startup pass: persist stored v1 settings as v2, once, keeping a local backup of the original. */
export function migrateMobileButtonsToV2(): void {
    try {
        const raw = globalStorage.get('mobileButtonSettings') as any;
        if (!raw || raw.version === 2) return;
        if (localStorage.getItem(MOBILE_BUTTONS_V1_BACKUP_KEY) === null) {
            localStorage.setItem(MOBILE_BUTTONS_V1_BACKUP_KEY, JSON.stringify(raw));
        }
        globalStorage.set('mobileButtonSettings', parseSettings(raw));
        console.log('[SettingsMigrations] Converted mobileButtonSettings to v2');
    } catch (e) {
        console.error('[SettingsMigrations] Failed to convert mobileButtonSettings to v2:', e);
    }
}

export function extractAlpha(color: string): number {
    const rgbaMatch = color.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*([\d.]+)\s*)?\)/i);
    if (rgbaMatch) {
        return rgbaMatch[1] !== undefined ? parseFloat(rgbaMatch[1]) : 1;
    }
    return 1;
}

export function computeBoxShadow(bgColor: string): string {
    const alpha = extractAlpha(bgColor);
    const shadowOpacity = Math.min(0.2, alpha * 0.3);
    return `0 2px 5px rgba(0, 0, 0, ${shadowOpacity})`;
}

/**
 * Label size for a mobile button: arrows get a fixed share of the button,
 * text labels the largest size at which their longest word still fits on a
 * line and every word fits on its own line (`white-space: normal` wraps them).
 * Assumes the condensed label face, measured at about 0.41em per glyph.
 */
export function mobileButtonFontSize(label: string, isText: boolean, buttonSize: number): number {
    const max = Math.round(buttonSize * 0.35);
    if (!isText) return max;
    const inner = buttonSize - 4;
    const words = label.trim().split(/\s+/).filter(Boolean);
    const longest = Math.max(1, ...words.map(word => word.length));
    const byWidth = inner / (longest * 0.42);
    const byHeight = inner / (Math.max(1, words.length) * 1.1);
    return Math.max(6, Math.floor(Math.min(max, byWidth, byHeight)));
}

/**
 * Notify listeners that mobile button settings changed. The actual DOM for
 * `#mobile-direction-buttons` is now owned by the shared `MobileDirectionButtons`
 * React component (src/ui/web/buttons), which re-renders declaratively from
 * `globalStorage`'s `mobileButtonSettings` key — this function no longer
 * mutates that DOM directly (it used to rebuild the buttons imperatively,
 * which would fight React for ownership of the container's children).
 * Kept for `MobileCommandRadial`'s reactivity (it reloads its own settings on
 * this event) and for callers like the settings editors that still expect a
 * post-save "apply" step.
 */
export function applySettings(settings: Settings, inTeam = false, isLeader = false) {
    const set = isLeader ? settings.leader : inTeam ? settings.team : settings.solo;
    eventBus.emit('mobileButtonsSettings', set.buttons);
}
