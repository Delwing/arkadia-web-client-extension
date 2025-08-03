import storage from "@client/src/storage";

export type MacroType =
    | 'functional'
    | 'zList'
    | 'zaList'
    | 'idzList'
    | 'command'
    | 'specialExit'
    | 'kierunek'
    | 'wesprzyj'
    | 'moveMode'
    | 'empty';

export interface ButtonSetting {
    macro: MacroType;
    label: string;
    color: string;
    command?: string;
    direction?: string;
}

export const defaultSettings: Record<string, ButtonSetting> = {
    // top row buttons
    'z-list-toggle': { macro: 'zList', label: '/z', color: '#6EB4DC' },
    'zas-list-toggle': { macro: 'zaList', label: '/za', color: '#6EB4DC' },
    'go-button': { macro: 'command', label: '/go', color: '#6EB4DC', command: '/go' },
    'buttons-toggle': { macro: 'functional', label: '⇩', color: '#6EB4DC' },
    'bracket-right-button': { macro: 'functional', label: ']', color: '#6EB4DC' },
    'button-1': { macro: 'wesprzyj', label: 'wesprzyj', color: '#6EB4DC' },
    'button-2': { macro: 'command', label: '/z cel', color: '#6EB4DC', command: '/z' },
    'button-3': { macro: 'command', label: '/za cel', color: '#6EB4DC', command: '/za' },

    // direction buttons in visual order
    'nw-button': { macro: 'kierunek', label: '↖', color: '#6CA6CD', command: 'nw', direction: 'nw' },
    'n-button': { macro: 'kierunek', label: '↑', color: '#6CA6CD', command: 'n', direction: 'n' },
    'ne-button': { macro: 'kierunek', label: '↗', color: '#6CA6CD', command: 'ne', direction: 'ne' },
    'u-button': { macro: 'kierunek', label: 'u', color: '#6CA6CD', command: 'u', direction: 'u' },
    'w-button': { macro: 'kierunek', label: '←', color: '#6CA6CD', command: 'w', direction: 'w' },
    'c-button': { macro: 'command', label: 'zerknij', color: '#6CA6CD', command: 'zerknij' },
    'e-button': { macro: 'kierunek', label: '→', color: '#6CA6CD', command: 'e', direction: 'e' },
    'd-button': { macro: 'kierunek', label: 'd', color: '#6CA6CD', command: 'd', direction: 'd' },
    'sw-button': { macro: 'kierunek', label: '↙', color: '#6CA6CD', command: 'sw', direction: 'sw' },
    's-button': { macro: 'kierunek', label: '↓', color: '#6CA6CD', command: 's', direction: 's' },
    'se-button': { macro: 'kierunek', label: '↘', color: '#6CA6CD', command: 'se', direction: 'se' },
    'special-exit-button': { macro: 'specialExit', label: 'sp ex', color: '#6CA6CD' },
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
}

export interface Settings {
    solo: LayoutSettings;
    team: LayoutSettings;
}

export function createDefaultLayout(): LayoutSettings {
    return { buttons: { ...defaultSettings }, order: [...defaultOrder], cols: defaultCols };
}

export async function loadSettings(): Promise<Settings> {
    try {
        const data = await storage.getItem('mobileButtonSettings');
        const raw = data?.mobileButtonSettings;
        if (raw) {
            const parseSet = (set: any): LayoutSettings => ({
                buttons: { ...defaultSettings, ...(set?.buttons || set || {}) },
                order: Array.isArray(set?.order) ? set.order : [...defaultOrder],
                cols: typeof set?.cols === 'number' && set.cols > 0 ? set.cols : defaultCols,
            });
            if (raw.solo && raw.team && (raw.solo.buttons || raw.team.buttons)) {
                return { solo: parseSet(raw.solo), team: parseSet(raw.team) };
            }
            const order = Array.isArray(raw.order) ? raw.order : [...defaultOrder];
            const cols = typeof raw.cols === 'number' && raw.cols > 0 ? raw.cols : defaultCols;
            return {
                solo: { buttons: { ...defaultSettings, ...(raw.solo || {}) }, order: [...order], cols },
                team: { buttons: { ...defaultSettings, ...(raw.team || raw.solo || {}) }, order: [...order], cols },
            };
        }
    } catch {}
    return { solo: createDefaultLayout(), team: createDefaultLayout() };
}

export function saveSettings(settings: Settings) {
    storage.setItem('mobileButtonSettings', settings);
}

export function applySettings(settings: Settings, inTeam = false) {
    const set = inTeam ? settings.team : settings.solo;
    const container = document.getElementById('mobile-direction-buttons') as HTMLDivElement | null;
    if (container) {
        container.style.gridTemplateColumns = `repeat(${set.cols}, auto)`;
        const z = document.getElementById('z-buttons-list');
        const zas = document.getElementById('zas-buttons-list');
        const idz = document.getElementById('idz-buttons-list');
        container.querySelectorAll('button').forEach(b => b.remove());
        const empty: ButtonSetting = { macro: 'empty', label: '', color: 'transparent' };
        const insertBefore = z || zas || idz || null;
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
                btn.style.backgroundColor = cfg.color;
            } else {
                btn.classList.add('empty');
            }
            container.insertBefore(btn, insertBefore);
        });
    }
    if ((window as any).clientExtension?.eventTarget) {
        (window as any).clientExtension.eventTarget.dispatchEvent(
            new CustomEvent('mobileButtonsSettings', { detail: set.buttons })
        );
    }
}


