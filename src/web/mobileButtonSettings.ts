import storage from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";

export type MacroType =
    | 'functional'
    | 'zList'
    | 'zaList'
    | 'wList'
    | 'przeList'
    | 'idzList'
    | 'command'
    | 'specialExit'
    | 'kierunek'
    | 'wesprzyj'
    | 'moveMode'
    | 'toggleButtons'
    | 'attackEnemy'
    | 'blockEnemy'
    | 'mute'
    | 'unmute'
    | 'empty';

export interface ButtonMacroConfig {
    macro: MacroType | string;  // string allows plugin macros like "plugin:..."
    command?: string;
    direction?: string;
    enemySlot?: number; // For attackEnemy and blockEnemy macros (0-2)
    pluginConfig?: Record<string, any>;
}

export interface ButtonSetting extends ButtonMacroConfig {
    label: string;
    color: string;
    activeColor?: string;
    fontColor?: string;
    syncWithDirections?: boolean;
    // Hold (tap and hold) action
    holdEnabled?: boolean;
    hold?: ButtonMacroConfig;
}

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

export const defaultFontColor = '#f1f5f9';

export const defaultBackground = 'rgba(135, 206, 235, 0.7)';

export const defaultButtonSize = 36;

export const defaultButtonGap = 10;

export const defaultSettings: Record<string, ButtonSetting> = {
    // top row buttons
    'z-list-toggle': { macro: 'zList', label: '/z', color: '#6EB4DC', fontColor: defaultFontColor },
    'zas-list-toggle': { macro: 'zaList', label: '/za', color: '#6EB4DC', fontColor: defaultFontColor },
    'go-button': { macro: 'command', label: '/go', color: '#6EB4DC', fontColor: defaultFontColor, command: '/go' },
    'buttons-toggle': { macro: 'toggleButtons', label: '⇩', color: '#6EB4DC', fontColor: defaultFontColor },
    'bracket-right-button': { macro: 'functional', label: ']', color: '#6EB4DC', fontColor: defaultFontColor },
    'button-1': { macro: 'wesprzyj', label: 'wesprzyj', color: '#6EB4DC', fontColor: defaultFontColor },
    'button-2': { macro: 'command', label: '/z cel', color: '#6EB4DC', fontColor: defaultFontColor, command: '/z' },
    'button-3': { macro: 'command', label: '/za cel', color: '#6EB4DC', fontColor: defaultFontColor, command: '/za' },

    // direction buttons in visual order
    'nw-button': {
        macro: 'kierunek',
        label: '↖',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'nw',
        direction: 'nw',
    },
    'n-button': {
        macro: 'kierunek',
        label: '↑',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'n',
        direction: 'n',
    },
    'ne-button': {
        macro: 'kierunek',
        label: '↗',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'ne',
        direction: 'ne',
    },
    'u-button': {
        macro: 'kierunek',
        label: 'u',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'u',
        direction: 'u',
    },
    'w-button': {
        macro: 'kierunek',
        label: '←',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'w',
        direction: 'w',
    },
    'c-button': { macro: 'command', label: 'zerknij', color: '#6CA6CD', fontColor: defaultFontColor, command: 'zerknij' },
    'e-button': {
        macro: 'kierunek',
        label: '→',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'e',
        direction: 'e',
    },
    'd-button': {
        macro: 'kierunek',
        label: 'd',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'd',
        direction: 'd',
    },
    'sw-button': {
        macro: 'kierunek',
        label: '↙',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'sw',
        direction: 'sw',
    },
    's-button': {
        macro: 'kierunek',
        label: '↓',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 's',
        direction: 's',
    },
    'se-button': {
        macro: 'kierunek',
        label: '↘',
        color: '#6CA6CD',
        activeColor: '#2fa7c5',
        fontColor: defaultFontColor,
        command: 'se',
        direction: 'se',
    },
    'special-exit-button': { macro: 'specialExit', label: 'sp ex', color: '#6CA6CD', fontColor: defaultFontColor },
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
    buttons: Record<string, ButtonSetting>;
    order: string[];
    cols: number;
    background: string;
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

const emptyButton: ButtonSetting = { macro: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor };

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

function extractButtons(set: any): Record<string, ButtonSetting> {
    if (!set || typeof set !== 'object') {
        return {};
    }
    const candidate = set.buttons && typeof set.buttons === 'object' ? set.buttons : set;
    const result: Record<string, ButtonSetting> = {};
    Object.keys(candidate).forEach(key => {
        if (['order', 'cols', 'background'].includes(key)) {
            return;
        }
        const value = candidate[key];
        if (value && typeof value === 'object') {
            result[key] = value as ButtonSetting;
        }
    });
    return result;
}

function mergeButtonSettings(buttons: Record<string, ButtonSetting>): Record<string, ButtonSetting> {
    const merged: Record<string, ButtonSetting> = {};
    const keys = new Set([...Object.keys(defaultSettings), ...Object.keys(buttons || {})]);
    keys.forEach(id => {
        const base = defaultSettings[id] || emptyButton;
        const override = (buttons && buttons[id]) || {};
        const cfg: ButtonSetting = { ...base, ...override };
        cfg.fontColor = cfg.fontColor || base.fontColor || defaultFontColor;
        merged[id] = cfg;
    });
    return merged;
}

function parseLayout(set: any, fallback: LayoutSettings = createDefaultLayout()): LayoutSettings {
    const buttons = mergeButtonSettings(extractButtons(set));
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

export async function loadSettings(): Promise<Settings> {
    try {
        const data = await storage.getItem('mobileButtonSettings');
        const raw = data?.mobileButtonSettings;
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
                    buttons: mergeButtonSettings(extractButtons(raw.solo)),
                    order: [...order],
                    cols,
                    background: soloBackground,
                },
                team: {
                    buttons: mergeButtonSettings(extractButtons(raw.team || raw.solo)),
                    order: [...order],
                    cols,
                    background: teamBackground,
                },
                leader: {
                    buttons: mergeButtonSettings(extractButtons(raw.leader || raw.team || raw.solo)),
                    order: [...order],
                    cols,
                    background: leaderBackground,
                },
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
    storage.setItem('mobileButtonSettings', settings);
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

export function applySettings(settings: Settings, inTeam = false, isLeader = false) {
    const set = isLeader ? settings.leader : inTeam ? settings.team : settings.solo;
    const container = document.getElementById('mobile-direction-buttons') as HTMLDivElement | null;
    if (container) {
        container.classList.toggle('drag-locked', settings.locked);
        if (settings.locked) {
            container.setAttribute('data-drag-locked', 'true');
        } else {
            container.removeAttribute('data-drag-locked');
        }
        container.style.gridTemplateColumns = `repeat(${set.cols}, auto)`;
        const bgColor = set.background || defaultBackground;
        container.style.backgroundColor = bgColor;
        container.style.boxShadow = computeBoxShadow(bgColor);

        // Get button size and gap from settings
        const buttonSize = settings.buttonSize ?? defaultButtonSize;
        const buttonGap = settings.buttonGap ?? defaultButtonGap;
        container.style.gap = buttonGap + 'px';

        const z = document.getElementById('z-buttons-list');
        const zas = document.getElementById('zas-buttons-list');
        const w = document.getElementById('w-buttons-list');
        const prze = document.getElementById('prze-buttons-list');
        const idz = document.getElementById('idz-buttons-list');
        container.querySelectorAll('button').forEach(b => b.remove());
        const empty: ButtonSetting = { ...emptyButton };
        const insertBefore = z || zas || w || prze || idz || null;
        set.order.forEach(id => {
            const cfg = set.buttons[id] || defaultSettings[id] || empty;

            // Handle color syncing for special exit buttons
            let effectiveColor = cfg.color;
            let effectiveActiveColor = cfg.activeColor;
            if (cfg.macro === 'specialExit' && cfg.syncWithDirections) {
                // Find a direction button to sync colors from
                const directionButton = Object.values(set.buttons).find(b => b.macro === 'kierunek');
                if (directionButton) {
                    effectiveColor = directionButton.color;
                    effectiveActiveColor = directionButton.activeColor || '#2fa7c5';
                }
            }

            const btn = document.createElement('button');
            btn.id = id;
            btn.className = 'mobile-button';
            if (cfg.macro === 'kierunek') {
                btn.classList.add('direction-button');
            } else if (cfg.macro === 'specialExit' && (effectiveActiveColor || cfg.syncWithDirections)) {
                btn.classList.add('direction-button');
                btn.classList.add('mobile-button-text');
            } else {
                btn.classList.add('mobile-button-text');
            }
            const isEmpty = cfg.macro === 'empty' || !cfg.label;
            if (!isEmpty) {
                btn.textContent = cfg.label;
                if (cfg.macro === 'kierunek' || (cfg.macro === 'specialExit' && (effectiveActiveColor || cfg.syncWithDirections))) {
                    btn.style.setProperty('--color', effectiveColor);
                    btn.style.setProperty('--active-color', effectiveActiveColor || '#2fa7c5');
                    btn.style.backgroundColor = effectiveColor;
                } else {
                    btn.style.backgroundColor = cfg.color;
                    btn.style.removeProperty('--color');
                    btn.style.removeProperty('--active-color');
                }
                btn.style.color = cfg.fontColor || defaultFontColor;
            } else {
                btn.classList.add('empty');
                btn.style.removeProperty('--color');
                btn.style.removeProperty('--active-color');
                btn.style.color = '';
                btn.style.backgroundColor = 'transparent';
            }
            container.insertBefore(btn, insertBefore);
        });

        // Apply button size with dynamic font sizing
        const buttons = container.querySelectorAll<HTMLButtonElement>('.mobile-button');
        buttons.forEach(btn => {
            const isTextButton = btn.classList.contains('mobile-button-text');
            // Font size scales with button size: direction ~35%, text ~20% to ensure fit
            const fontSize = isTextButton ? Math.max(6, Math.round(buttonSize * 0.20)) : Math.round(buttonSize * 0.35);
            btn.style.width = buttonSize + 'px';
            btn.style.height = buttonSize + 'px';
            btn.style.fontSize = fontSize + 'px';
        });

        const lists = document.querySelectorAll<HTMLDivElement>('.mobile-z-buttons, .mobile-idz-buttons');
        lists.forEach(div => {
            div.style.gridAutoRows = buttonSize + 'px';
        });
    }
    eventBus.emit('mobileButtonsSettings', set.buttons);
}
