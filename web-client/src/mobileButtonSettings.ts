import storage from "@client/src/storage";

export type MacroType = 'functional' | 'zList' | 'zaList' | 'command' | 'specialExit' | 'kierunek';

export interface ButtonSetting {
    macro: MacroType;
    label: string;
    color: string;
    command?: string;
    direction?: string;
}

export const defaultSettings: Record<string, ButtonSetting> = {
    'z-list-toggle': { macro: 'zList', label: '/z', color: '#87CEEB' },
    'zas-list-toggle': { macro: 'zaList', label: '/za', color: '#87CEEB' },
    'go-button': { macro: 'command', label: '/go', color: '#87CEEB', command: '/go' },
    'bracket-right-button': { macro: 'functional', label: ']', color: '#87CEEB' },
    'button-1': { macro: 'command', label: 'wesprzyj', color: '#87CEEB', command: 'wesprzyj' },
    'button-2': { macro: 'command', label: '/z cel', color: '#87CEEB', command: '/z' },
    'button-3': { macro: 'command', label: '/za cel', color: '#87CEEB', command: '/za' },
    'c-button': { macro: 'command', label: 'zerknij', color: '#6CA6CD', command: 'zerknij' },
    'u-button': { macro: 'kierunek', label: 'u', color: '#6CA6CD', command: 'u', direction: 'u' },
    'd-button': { macro: 'kierunek', label: 'd', color: '#6CA6CD', command: 'd', direction: 'd' },
    'special-exit-button': { macro: 'specialExit', label: 'sp ex', color: '#6CA6CD' },
    'nw-button': { macro: 'kierunek', label: '↖', color: '#6CA6CD', command: 'nw', direction: 'nw' },
    'n-button': { macro: 'kierunek', label: '↑', color: '#6CA6CD', command: 'n', direction: 'n' },
    'ne-button': { macro: 'kierunek', label: '↗', color: '#6CA6CD', command: 'ne', direction: 'ne' },
    'w-button': { macro: 'kierunek', label: '←', color: '#6CA6CD', command: 'w', direction: 'w' },
    'e-button': { macro: 'kierunek', label: '→', color: '#6CA6CD', command: 'e', direction: 'e' },
    'sw-button': { macro: 'kierunek', label: '↙', color: '#6CA6CD', command: 'sw', direction: 'sw' },
    's-button': { macro: 'kierunek', label: '↓', color: '#6CA6CD', command: 's', direction: 's' },
    'se-button': { macro: 'kierunek', label: '↘', color: '#6CA6CD', command: 'se', direction: 'se' },
};

export async function loadSettings(): Promise<Record<string, ButtonSetting>> {
    try {
        const data = await storage.getItem('mobileButtonSettings');
        const raw = data?.mobileButtonSettings;
        if (raw) {
            return { ...defaultSettings, ...(raw as any) };
        }
    } catch {}
    return { ...defaultSettings };
}

export function saveSettings(settings: Record<string, ButtonSetting>) {
    storage.setItem('mobileButtonSettings', settings);
}

export function applySettings(settings: Record<string, ButtonSetting>) {
    Object.entries(settings).forEach(([id, cfg]) => {
        const el = document.getElementById(id) as HTMLButtonElement | null;
        if (!el) return;
        el.textContent = cfg.label;
        el.style.backgroundColor = cfg.color;
        if (cfg.direction) {
            el.dataset.direction = cfg.direction;
        } else {
            el.removeAttribute('data-direction');
        }
    });
    if ((window as any).clientExtension?.eventTarget) {
        (window as any).clientExtension.eventTarget.dispatchEvent(
            new CustomEvent('mobileButtonsSettings', { detail: settings })
        );
    }
}

// The DOM-based implementation has been removed in favor of a React component.

