import Modal from "bootstrap/js/dist/modal";
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
    | 'moveMode';

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

export interface Settings {
    solo: Record<string, ButtonSetting>;
    team: Record<string, ButtonSetting>;
    order: string[];
    cols: number;
}

export async function loadSettings(): Promise<Settings> {
    try {
        const data = await storage.getItem('mobileButtonSettings');
        const raw = data?.mobileButtonSettings;
        if (raw) {
            const order = Array.isArray(raw.order) ? raw.order : defaultOrder;
            const cols = typeof raw.cols === 'number' && raw.cols > 0 ? raw.cols : defaultCols;
            if (raw.solo || raw.team) {
                return {
                    solo: { ...defaultSettings, ...(raw.solo || {}) },
                    team: { ...defaultSettings, ...(raw.team || raw.solo || {}) },
                    order,
                    cols,
                };
            }
            return {
                solo: { ...defaultSettings, ...(raw as any) },
                team: { ...defaultSettings, ...(raw as any) },
                order,
                cols,
            };
        }
    } catch {}
    return { solo: { ...defaultSettings }, team: { ...defaultSettings }, order: [...defaultOrder], cols: defaultCols };
}

export function saveSettings(settings: Settings) {
    storage.setItem('mobileButtonSettings', settings);
}

export function applySettings(settings: Settings, inTeam = false) {
    const set = inTeam ? settings.team : settings.solo;
    const container = document.getElementById('mobile-direction-buttons') as HTMLDivElement | null;
    if (container) {
        container.style.gridTemplateColumns = `repeat(${settings.cols}, auto)`;
        const z = document.getElementById('z-buttons-list');
        const zas = document.getElementById('zas-buttons-list');
        const idz = document.getElementById('idz-buttons-list');
        container.querySelectorAll('button').forEach(b => b.remove());
        const empty: ButtonSetting = { macro: 'command', label: '', color: 'transparent' };
        const insertBefore = z || zas || idz || null;
        settings.order.forEach(id => {
            const cfg = set[id] || defaultSettings[id] || empty;
            const btn = document.createElement('button');
            btn.id = id;
            btn.className = 'mobile-button';
            if (cfg.macro === 'kierunek') {
                btn.classList.add('direction-button');
            } else {
                btn.classList.add('mobile-button-text');
            }
            if (cfg.label) {
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
            new CustomEvent('mobileButtonsSettings', { detail: set })
        );
    }
}

export default async function initMobileButtonSettings() {
    const button = document.getElementById('mobile-buttons-button') as HTMLButtonElement | null;
    const modalEl = document.getElementById('mobile-buttons-modal');
    if (!button || !modalEl) return;

    const modal = new Modal(modalEl);
    const saveBtn = modalEl.querySelector('#mobile-buttons-save') as HTMLButtonElement;

    const sections = Array.from(modalEl.querySelectorAll<HTMLElement>('.mobile-button-config'));
    const previewButtons = Array.from(modalEl.querySelectorAll<HTMLButtonElement>(
        '#mobile-buttons-preview-solo button[data-button-id], #mobile-buttons-preview-team button[data-button-id]'
    ));
    const previewMap: Record<string, HTMLButtonElement> = {};
    const realMap: Record<string, HTMLButtonElement> = {};
    previewButtons.forEach(btn => {
        const id = btn.dataset.buttonId!;
        previewMap[id] = btn;
    });
    Object.keys(defaultSettings).forEach(id => {
        const el = document.getElementById(id) as HTMLButtonElement | null;
        if (el) realMap[id] = el;
    });
    const modalBody = modalEl.querySelector('.modal-body') as HTMLElement;
    let activeConfig: HTMLElement | null = null;

    const hideConfig = () => {
        if (activeConfig) {
            activeConfig.classList.add('d-none');
            activeConfig = null;
        }
    };

    let current = (await loadSettings()).solo;
    const applyLive = (id: string, labelVal: string, colorVal: string) => {
        const btn = realMap[id];
        if (btn) {
            btn.textContent = labelVal;
            btn.style.backgroundColor = colorVal;
        }
    };
    sections.forEach(section => {
        const id = section.dataset.buttonId!;
        const cfg = current[id] || defaultSettings[id];
        const preview = previewMap[id];
        const macro = section.querySelector('.mobile-button-macro') as HTMLSelectElement;
        const label = section.querySelector('.mobile-button-label') as HTMLInputElement;
        const color = section.querySelector('.mobile-button-color') as HTMLInputElement;
        const command = section.querySelector('.mobile-button-command') as HTMLTextAreaElement;
        const cmdLabel = section.querySelector('.mobile-button-command-label') as HTMLElement;
        const direction = section.querySelector('.mobile-button-direction') as HTMLSelectElement;
        const dirLabel = section.querySelector('.mobile-button-direction-label') as HTMLElement;
        const reset = section.querySelector('.mobile-button-color-reset') as HTMLButtonElement | null;

        macro.value = cfg.macro;
        label.value = cfg.label;
        color.value = cfg.color;
        if (command) command.value = cfg.command || '';
        if (direction) direction.value = cfg.direction || '';
        if (preview) {
            preview.textContent = label.value;
            preview.style.backgroundColor = color.value;
        }
        applyLive(id, label.value, color.value);
        const update = () => {
            if (macro.value === 'command') {
                cmdLabel.style.display = '';
            } else {
                cmdLabel.style.display = 'none';
            }
            if (macro.value === 'kierunek') {
                dirLabel.style.display = '';
            } else {
                dirLabel.style.display = 'none';
            }
        };
        macro.addEventListener('change', update);
        if (reset) {
            reset.addEventListener('click', () => {
                color.value = defaultSettings[id].color;
                if (preview) preview.style.backgroundColor = color.value;
                applyLive(id, label.value, color.value);
            });
        }
        label.addEventListener('input', () => {
            if (preview) preview.textContent = label.value;
            applyLive(id, label.value, color.value);
        });
        color.addEventListener('input', () => {
            if (preview) preview.style.backgroundColor = color.value;
            applyLive(id, label.value, color.value);
        });
        update();
    });

    previewButtons.forEach(btn => {
        const id = btn.dataset.buttonId!;
        const config = sections.find(s => s.dataset.buttonId === id);
        if (!config) return;
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            if (activeConfig === config) {
                hideConfig();
                return;
            }
            hideConfig();
            const rect = btn.getBoundingClientRect();
            const bodyRect = modalBody.getBoundingClientRect();
            config.style.left = rect.left - bodyRect.left + 'px';
            config.style.top = rect.bottom - bodyRect.top + 4 + 'px';
            config.classList.remove('d-none');
            activeConfig = config;
        });
    });

    modalEl.addEventListener('click', (ev) => {
        if (activeConfig && !activeConfig.contains(ev.target as Node)) {
            const isButton = (ev.target as HTMLElement).closest(
                '#mobile-buttons-preview-solo button, #mobile-buttons-preview-team button'
            );
            if (!isButton) hideConfig();
        }
    });

    modalEl.addEventListener('hide.bs.modal', hideConfig);

    const read = (): Record<string, ButtonSetting> => {
        const result: Record<string, ButtonSetting> = {};
        sections.forEach(section => {
            const id = section.dataset.buttonId!;
            const macro = (section.querySelector('.mobile-button-macro') as HTMLSelectElement).value as MacroType;
            const label = (section.querySelector('.mobile-button-label') as HTMLInputElement).value;
            const color = (section.querySelector('.mobile-button-color') as HTMLInputElement).value;
            const command = (section.querySelector('.mobile-button-command') as HTMLTextAreaElement).value;
            const direction = (section.querySelector('.mobile-button-direction') as HTMLSelectElement).value;
            result[id] = { macro, label, color, command, direction };
        });
        return result;
    };

    saveBtn.addEventListener('click', () => {
        current = read();
        const all = { solo: current, team: current } as Settings;
        saveSettings(all);
        applySettings(all);
        modal.hide();
    });

    button.addEventListener('click', () => {
        modal.show();
    });

    applySettings({ solo: current, team: current });
}


