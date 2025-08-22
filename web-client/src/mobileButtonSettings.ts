import storage from "@client/src/storage";

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
    command?: string;
    direction?: string;
}

export const defaultSettings: Record<string, ButtonSetting> = {
    // top row buttons
    'z-list-toggle': { macro: 'zList', label: '/z', color: '#6EB4DC' },
    'zas-list-toggle': { macro: 'zaList', label: '/za', color: '#6EB4DC' },
    'go-button': { macro: 'command', label: '/go', color: '#6EB4DC', command: '/go' },
    'buttons-toggle': { macro: 'toggleButtons', label: '⇩', color: '#6EB4DC' },
    'bracket-right-button': { macro: 'functional', label: ']', color: '#6EB4DC' },
    'button-1': { macro: 'wesprzyj', label: 'wesprzyj', color: '#6EB4DC' },
    'button-2': { macro: 'command', label: '/z cel', color: '#6EB4DC', command: '/z' },
    'button-3': { macro: 'command', label: '/za cel', color: '#6EB4DC', command: '/za' },

    // direction buttons in visual order
    'nw-button': { macro: 'kierunek', label: '↖', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'nw', direction: 'nw' },
    'n-button': { macro: 'kierunek', label: '↑', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'n', direction: 'n' },
    'ne-button': { macro: 'kierunek', label: '↗', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'ne', direction: 'ne' },
    'u-button': { macro: 'kierunek', label: 'u', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'u', direction: 'u' },
    'w-button': { macro: 'kierunek', label: '←', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'w', direction: 'w' },
    'c-button': { macro: 'command', label: 'zerknij', color: '#6CA6CD', command: 'zerknij' },
    'e-button': { macro: 'kierunek', label: '→', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'e', direction: 'e' },
    'd-button': { macro: 'kierunek', label: 'd', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'd', direction: 'd' },
    'sw-button': { macro: 'kierunek', label: '↙', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'sw', direction: 'sw' },
    's-button': { macro: 'kierunek', label: '↓', color: '#6CA6CD', activeColor: '#2fa7c5', command: 's', direction: 's' },
    'se-button': { macro: 'kierunek', label: '↘', color: '#6CA6CD', activeColor: '#2fa7c5', command: 'se', direction: 'se' },
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
    leader: LayoutSettings;
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
            if (raw.solo && raw.team && raw.leader && (raw.solo.buttons || raw.team.buttons || raw.leader.buttons)) {
                return { solo: parseSet(raw.solo), team: parseSet(raw.team), leader: parseSet(raw.leader) };
            }
            const order = Array.isArray(raw.order) ? raw.order : [...defaultOrder];
            const cols = typeof raw.cols === 'number' && raw.cols > 0 ? raw.cols : defaultCols;
            return {
                solo: { buttons: { ...defaultSettings, ...(raw.solo || {}) }, order: [...order], cols },
                team: { buttons: { ...defaultSettings, ...(raw.team || raw.solo || {}) }, order: [...order], cols },
                leader: { buttons: { ...defaultSettings, ...(raw.leader || raw.team || raw.solo || {}) }, order: [...order], cols },
            };
        }
    } catch {}
    return { solo: createDefaultLayout(), team: createDefaultLayout(), leader: createDefaultLayout() };
}

export function saveSettings(settings: Settings) {
    storage.setItem('mobileButtonSettings', settings);
}

export function applySettings(settings: Settings, inTeam = false, isLeader = false) {
    const set = isLeader ? settings.leader : inTeam ? settings.team : settings.solo;
    const container = document.getElementById('mobile-direction-buttons') as HTMLDivElement | null;
    if (container) {
        container.style.gridTemplateColumns = `repeat(${set.cols}, auto)`;

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
        const empty: ButtonSetting = { macro: 'empty', label: '', color: 'transparent' };
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
                } else {
                    btn.style.backgroundColor = cfg.color;
                }
            } else {
                btn.classList.add('empty');
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
    if ((window as any).clientExtension?.eventTarget) {
        (window as any).clientExtension.eventTarget.dispatchEvent(
            new CustomEvent('mobileButtonsSettings', { detail: set.buttons })
        );
    }
}


