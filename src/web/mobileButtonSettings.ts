import { globalStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";
import { ButtonMacroConfig, MobileButtonSetting, defaultFontColor } from "./buttonSettings";

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
    'z-list-toggle': { macroType: 'zList', label: '/z', color: '#6EB4DC', fontColor: defaultFontColor },
    'zas-list-toggle': { macroType: 'zaList', label: '/za', color: '#6EB4DC', fontColor: defaultFontColor },
    'go-button': { macroType: 'command', label: '/go', color: '#6EB4DC', fontColor: defaultFontColor, command: '/go' },
    'buttons-toggle': { macroType: 'toggleButtons', label: '⇩', color: '#6EB4DC', fontColor: defaultFontColor },
    'bracket-right-button': { macroType: 'functional', label: ']', color: '#6EB4DC', fontColor: defaultFontColor },
    'button-1': { macroType: 'wesprzyj', label: 'wesprzyj', color: '#6EB4DC', fontColor: defaultFontColor },
    'button-2': { macroType: 'command', label: '/z cel', color: '#6EB4DC', fontColor: defaultFontColor, command: '/z' },
    'button-3': { macroType: 'command', label: '/za cel', color: '#6EB4DC', fontColor: defaultFontColor, command: '/za' },

    // direction buttons in visual order
    'nw-button': {
        macroType: 'kierunek',
        label: '↖',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'nw',
        direction: 'nw',
    },
    'n-button': {
        macroType: 'kierunek',
        label: '↑',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'n',
        direction: 'n',
    },
    'ne-button': {
        macroType: 'kierunek',
        label: '↗',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'ne',
        direction: 'ne',
    },
    'u-button': {
        macroType: 'kierunek',
        label: 'u',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'u',
        direction: 'u',
    },
    'w-button': {
        macroType: 'kierunek',
        label: '←',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'w',
        direction: 'w',
    },
    'c-button': { macroType: 'command', label: 'zerknij', color: '#6CA6CD', fontColor: defaultFontColor, command: 'zerknij' },
    'e-button': {
        macroType: 'kierunek',
        label: '→',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'e',
        direction: 'e',
    },
    'd-button': {
        macroType: 'kierunek',
        label: 'd',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'd',
        direction: 'd',
    },
    'sw-button': {
        macroType: 'kierunek',
        label: '↙',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'sw',
        direction: 'sw',
    },
    's-button': {
        macroType: 'kierunek',
        label: '↓',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 's',
        direction: 's',
    },
    'se-button': {
        macroType: 'kierunek',
        label: '↘',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'se',
        direction: 'se',
    },
    'special-exit-button': { macroType: 'specialExit', label: 'sp ex', color: '#6CA6CD', fontColor: defaultFontColor },
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

export interface LayoutOverride {
    cols?: number;
    background?: string;
    // Cells inserted before the base layout (negative-indexed positions).
    // Their button configs go in `buttons`.
    prepend?: string[];
    // Cells appended after the base layout.
    append?: string[];
    // Aligned with base order by index. null/undefined at index i = inherit base.order[i],
    // string = replace that cell. Length should equal base.order.length when set.
    // Used together with prepend/append to express partial layout changes while preserving inheritance.
    order?: (string | null)[];
    // Sparse field overrides keyed by button id. Buttons with no entry inherit the base config fully.
    buttons?: Record<string, Partial<MobileButtonSetting>>;
}

export interface Settings {
    solo: LayoutSettings;
    team: LayoutSettings;
    leader: LayoutSettings;
    locked: boolean;
    radial: RadialSettings;
    buttonSize?: number;   // Size in pixels (default 36)
    buttonGap?: number;    // Gap between buttons in pixels (default 2)
}

export function createDefaultLayout(): LayoutSettings {
    return { buttons: { ...defaultSettings }, order: [...defaultOrder], cols: defaultCols, background: defaultBackground };
}

function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

/**
 * Resolves the runtime layout for a mode by applying its sparse override on top of the base.
 * Final order is: [...prepend, ...positional inheritance from base + override.order, ...append].
 * Returns the offset where base cells start in the resolved order (= prepend.length).
 */
export function resolveLayout(base: LayoutSettings, override?: LayoutOverride | null): LayoutSettings {
    if (!override) {
        return {
            buttons: { ...base.buttons },
            order: [...base.order],
            cols: base.cols,
            background: base.background,
        };
    }
    const cols = typeof override.cols === 'number' && override.cols > 0 ? override.cols : base.cols;
    const background = typeof override.background === 'string' && override.background ? override.background : base.background;
    const order: string[] = [];
    if (Array.isArray(override.prepend)) {
        for (const id of override.prepend) order.push(id);
    }
    for (let i = 0; i < base.order.length; i++) {
        const o = override.order?.[i];
        if (typeof o === 'string') order.push(o);
        else order.push(base.order[i]);
    }
    if (Array.isArray(override.append)) {
        for (const id of override.append) order.push(id);
    }
    const buttons: Record<string, MobileButtonSetting> = {};
    const ids = new Set<string>([...order, ...Object.keys(base.buttons), ...Object.keys(override.buttons || {})]);
    ids.forEach(id => {
        const baseCfg = base.buttons[id];
        const overrideCfg = override.buttons?.[id];
        if (baseCfg && overrideCfg) {
            buttons[id] = { ...baseCfg, ...overrideCfg };
        } else if (baseCfg) {
            buttons[id] = baseCfg;
        } else if (overrideCfg) {
            buttons[id] = { macroType: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor, ...overrideCfg } as MobileButtonSetting;
        }
    });
    return { buttons, order, cols, background };
}

/**
 * Returns the offset at which base.order appears as a contiguous subsequence in newOrder,
 * or -1 if it doesn't. Used to detect prepend/append patterns.
 */
function findBaseOffset(newOrder: string[], baseOrder: string[]): number {
    if (baseOrder.length === 0) return newOrder.length === 0 ? 0 : -1;
    const limit = newOrder.length - baseOrder.length;
    outer: for (let off = 0; off <= limit; off++) {
        for (let i = 0; i < baseOrder.length; i++) {
            if (newOrder[off + i] !== baseOrder[i]) continue outer;
        }
        return off;
    }
    return -1;
}

const ALL_BUTTON_FIELDS: (keyof MobileButtonSetting)[] = [
    'macroType', 'command', 'direction', 'enemySlot', 'pluginConfig', 'steps',
    'label', 'color', 'fontColor', 'holdEnabled', 'hold', 'activeColor', 'syncWithDirections',
];

function diffButton(newCfg: MobileButtonSetting, baseCfg: MobileButtonSetting | undefined): Partial<MobileButtonSetting> | null {
    if (!baseCfg) {
        // Brand-new mode-specific button: store full config
        return { ...newCfg };
    }
    const diff: Partial<MobileButtonSetting> = {};
    let changed = false;
    for (const key of ALL_BUTTON_FIELDS) {
        const a = (newCfg as any)[key];
        const b = (baseCfg as any)[key];
        if (!deepEqual(a, b)) {
            (diff as any)[key] = a;
            changed = true;
        }
    }
    return changed ? diff : null;
}

export function diffLayout(newLayout: LayoutSettings, base: LayoutSettings): LayoutOverride | null {
    const override: LayoutOverride = {};
    let hasChange = false;
    if (newLayout.cols !== base.cols) {
        override.cols = newLayout.cols;
        hasChange = true;
    }
    if (newLayout.background !== base.background) {
        override.background = newLayout.background;
        hasChange = true;
    }

    // Order diff: try to express layout as [prepend, base + positional override, append]
    // so adding rows to top/bottom doesn't destroy positional inheritance for the base region.
    const sameLength = newLayout.order.length === base.order.length;
    let orderDiffers = !sameLength;
    if (sameLength) {
        for (let i = 0; i < newLayout.order.length; i++) {
            if (newLayout.order[i] !== base.order[i]) { orderDiffers = true; break; }
        }
    }
    if (orderDiffers) {
        const offset = findBaseOffset(newLayout.order, base.order);
        if (offset >= 0) {
            // Base appears intact at `offset`; capture only prepend/append cells.
            const prepend = newLayout.order.slice(0, offset);
            const append = newLayout.order.slice(offset + base.order.length);
            if (prepend.length > 0) override.prepend = prepend;
            if (append.length > 0) override.append = append;
            hasChange = true;
        } else if (sameLength) {
            // Same shape, some cells replaced: store positional sparse diff.
            override.order = newLayout.order.map((id, i) => id === base.order[i] ? null : id);
            hasChange = true;
        } else {
            // Layout diverges structurally; full prepend stores the entire order.
            override.prepend = [...newLayout.order];
            hasChange = true;
        }
    }

    // Button diffs: only for buttons that appear in the new layout
    const overrideButtons: Record<string, Partial<MobileButtonSetting>> = {};
    let anyButtonDiff = false;
    const ids = new Set(newLayout.order);
    ids.forEach(id => {
        const newCfg = newLayout.buttons[id];
        if (!newCfg) return;
        const baseCfg = base.buttons[id];
        const d = diffButton(newCfg, baseCfg);
        if (d) {
            overrideButtons[id] = d;
            anyButtonDiff = true;
        }
    });
    if (anyButtonDiff) {
        override.buttons = overrideButtons;
        hasChange = true;
    }
    return hasChange ? override : null;
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

function parseStoredOverride(raw: any): LayoutOverride | null {
    if (!raw || typeof raw !== 'object') return null;
    const override: LayoutOverride = {};
    if (typeof raw.cols === 'number' && raw.cols > 0) override.cols = raw.cols;
    if (typeof raw.background === 'string' && raw.background) override.background = raw.background;
    if (Array.isArray(raw.prepend)) {
        const prepend = raw.prepend.filter((e: unknown): e is string => typeof e === 'string');
        if (prepend.length > 0) override.prepend = prepend;
    }
    if (Array.isArray(raw.append)) {
        const append = raw.append.filter((e: unknown): e is string => typeof e === 'string');
        if (append.length > 0) override.append = append;
    }
    if (Array.isArray(raw.order)) {
        override.order = raw.order.map((entry: unknown) =>
            typeof entry === 'string' ? entry : null,
        );
    }
    if (raw.buttons && typeof raw.buttons === 'object') {
        const buttons: Record<string, Partial<MobileButtonSetting>> = {};
        Object.keys(raw.buttons).forEach(id => {
            const value = raw.buttons[id];
            if (value && typeof value === 'object') {
                // Migrate legacy `macro` field on partial overrides
                if (typeof (value as any).macro === 'string' && typeof value.macroType !== 'string') {
                    value.macroType = (value as any).macro;
                    delete (value as any).macro;
                }
                buttons[id] = value as Partial<MobileButtonSetting>;
            }
        });
        if (Object.keys(buttons).length > 0) override.buttons = buttons;
    }
    const empty = override.cols === undefined && override.background === undefined
        && !override.prepend && !override.append && !override.order && !override.buttons;
    return empty ? null : override;
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

export function loadSettings(): Settings {
    try {
        const raw = globalStorage.get('mobileButtonSettings') as any;
        if (raw && raw.solo && (raw.solo.buttons || raw.solo.order)) {
            const locked = !!raw.locked;
            const buttonSize = typeof raw.buttonSize === 'number' && raw.buttonSize > 0 ? raw.buttonSize : defaultButtonSize;
            const buttonGap = typeof raw.buttonGap === 'number' && raw.buttonGap >= 0 ? raw.buttonGap : defaultButtonGap;
            const base = parseLayout(raw.solo);
            return {
                solo: base,
                team: resolveLayout(base, parseStoredOverride(raw.team)),
                leader: resolveLayout(base, parseStoredOverride(raw.leader)),
                locked,
                radial: parseRadialSettings(raw.radial),
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
        buttonSize: defaultButtonSize,
        buttonGap: defaultButtonGap,
    };
}

export function saveSettings(settings: Settings) {
    const teamOverride = diffLayout(settings.team, settings.solo);
    const leaderOverride = diffLayout(settings.leader, settings.solo);
    const stored: Record<string, unknown> = {
        format: 2,
        solo: settings.solo,
        locked: settings.locked,
        radial: settings.radial,
    };
    if (teamOverride) stored.team = teamOverride;
    if (leaderOverride) stored.leader = leaderOverride;
    if (settings.buttonSize !== undefined) stored.buttonSize = settings.buttonSize;
    if (settings.buttonGap !== undefined) stored.buttonGap = settings.buttonGap;
    // Stored shape diverges from runtime Settings (team/leader are sparse overrides);
    // the global storage schema is typed against runtime Settings, so we cast for set.
    globalStorage.set('mobileButtonSettings', stored as unknown as Settings);
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
