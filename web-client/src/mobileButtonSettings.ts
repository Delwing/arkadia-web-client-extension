import storage from "@client/src/storage";
import appEventBus from "@client/src/events/app-event-bus.ts";

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
    | 'empty';

export interface ButtonSetting {
    macro: MacroType;
    label: string;
    color: string;
    activeColor?: string;
    fontColor?: string;
    command?: string;
    direction?: string;
}

export const defaultFontColor = '#f1f5f9';

export const defaultBackground = 'rgba(135, 206, 235, 0.7)';

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
}

export function createDefaultLayout(): LayoutSettings {
    return { buttons: { ...defaultSettings }, order: [...defaultOrder], cols: defaultCols, background: defaultBackground };
}

const emptyButton: ButtonSetting = { macro: 'empty', label: '', color: 'transparent', fontColor: defaultFontColor };

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

export async function loadSettings(): Promise<Settings> {
    try {
        const data = await storage.getItem('mobileButtonSettings');
        const raw = data?.mobileButtonSettings;
        if (raw) {
            const locked = !!raw.locked;
            if (raw.solo && raw.team && raw.leader && (raw.solo.buttons || raw.team.buttons || raw.leader.buttons)) {
                return {
                    solo: parseLayout(raw.solo),
                    team: parseLayout(raw.team),
                    leader: parseLayout(raw.leader),
                    locked,
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
            };
        }
    } catch {}
    return { solo: createDefaultLayout(), team: createDefaultLayout(), leader: createDefaultLayout(), locked: false };
}

export function saveSettings(settings: Settings) {
    storage.setItem('mobileButtonSettings', settings);
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
        container.style.backgroundColor = set.background || defaultBackground;

        // Preserve current button size
        const ref = container.querySelector('.mobile-button') as HTMLButtonElement | null;
        let sizeRatio = 1;
        if (ref) {
            const styles = window.getComputedStyle(ref);
            const width = parseFloat(styles.width);
            if (!Number.isNaN(width) && width > 0) {
                sizeRatio = width / 36;
            }
        }

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
            const btn = document.createElement('button');
            btn.id = id;
            btn.className = 'mobile-button';
            if (cfg.macro === 'kierunek') {
                btn.classList.add('direction-button');
            } else {
                btn.classList.add('mobile-button-text');
            }
            const isEmpty = cfg.macro === 'empty' || !cfg.label;
            if (!isEmpty) {
                btn.textContent = cfg.label;
                if (cfg.macro === 'kierunek') {
                    btn.style.setProperty('--color', cfg.color);
                    btn.style.setProperty('--active-color', cfg.activeColor || '#2fa7c5');
                    btn.style.backgroundColor = cfg.color;
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

        // Apply preserved size to new buttons
        const buttons = container.querySelectorAll<HTMLButtonElement>('.mobile-button');
        buttons.forEach(btn => {
            const baseSize = 36;
            const baseFont = btn.classList.contains('mobile-button-text') ? 9 : 14;
            btn.style.width = baseSize * sizeRatio + 'px';
            btn.style.height = baseSize * sizeRatio + 'px';
            btn.style.fontSize = baseFont * sizeRatio + 'px';
        });

        const lists = document.querySelectorAll<HTMLDivElement>('.mobile-z-buttons, .mobile-idz-buttons');
        lists.forEach(div => {
            const baseRow = 36;
            div.style.gridAutoRows = baseRow * sizeRatio + 'px';
        });
    }
    appEventBus.emit('mobileButtonsSettings', set.buttons);
}


