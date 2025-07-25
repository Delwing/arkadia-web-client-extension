import Modal from "bootstrap/js/dist/modal";

interface UiSettings {
    contentFontSize: number;
    objectsFontSize: number;
    buttonSize: number;
    mapScale: number;
    mapLimit: number;
    showButtons: boolean;
    mapHeight: number;
    emojiLabels: boolean;
    xtermPalette: 'arkadia' | 'proper';
    footerMode: number;
}

const defaultSettings: UiSettings = {
    contentFontSize: 0.775,
    objectsFontSize: 0.6,
    buttonSize: 1,
    mapScale: 0.30,
    mapLimit: 35,
    showButtons: true,
    mapHeight: typeof window !== 'undefined' && window.innerWidth < 768 ? 25 : 30,
    emojiLabels: false,
    xtermPalette: 'arkadia',
    footerMode: 0,
};

function apply(settings: UiSettings) {
    const content = document.getElementById('main_text_output_msg_wrapper');
    if (content) {
        content.style.fontSize = settings.contentFontSize + 'rem';
    }
    const charState = document.getElementById('char-state');
    if (charState) {
        charState.style.fontSize = settings.contentFontSize + 'rem';
        charState.setAttribute('data-footer-mode', String(settings.footerMode));
    }
    const objects = document.getElementById('objects-list');
    if (objects) {
        objects.style.fontSize = settings.objectsFontSize + 'rem';
    }
    const iframeContainer = document.getElementById('iframe-container');
    if (iframeContainer) {
        const height = settings.mapHeight + 'vh';
        (iframeContainer as HTMLElement).style.height = height;
        (iframeContainer as HTMLElement).style.maxHeight = height;
    }
    document.querySelectorAll<HTMLButtonElement>('.mobile-button').forEach(btn => {
        const baseSize = 36; // default width/height in px
        const baseFont = btn.classList.contains('mobile-button-text') ? 9 : 14;
        btn.style.width = baseSize * settings.buttonSize + 'px';
        btn.style.height = baseSize * settings.buttonSize + 'px';
        btn.style.fontSize = baseFont * settings.buttonSize + 'px';
    });

    if (content) {
        content.scrollTop = content.scrollHeight;
    }

    // Adjust grid row size for dynamically created Z buttons
    document.querySelectorAll<HTMLDivElement>('.mobile-z-buttons').forEach(div => {
        const baseRow = 36; // default row height in px
        div.style.gridAutoRows = baseRow * settings.buttonSize + 'px';
    });
    if ((window as any).embedded?.renderer?.controls) {
        (window as any).embedded.setZoom?.(settings.mapScale);
        (window as any).embedded.setLimit?.(settings.mapLimit);
        (window as any).embedded.refresh();
    }
    if ((window as any).clientExtension?.eventTarget) {
        (window as any).clientExtension.eventTarget.dispatchEvent(
            new CustomEvent('uiSettings', {
                detail: {
                    mobileDirectionButtons: settings.showButtons,
                    emojiLabels: settings.emojiLabels,
                    xtermPalette: settings.xtermPalette,
                    footerMode: settings.footerMode,
                },
            })
        );
    }
}

import storage from "@client/src/storage";

async function load(): Promise<UiSettings> {
    try {
        const [uiData, settingsData] = await Promise.all([
            storage.getItem('uiSettings'),
            storage.getItem('settings'),
        ]);
        let raw = uiData?.uiSettings;
        let parsed: any = {};
        if (raw) {
            parsed = raw as any;
        }
        if (!parsed.xtermPalette && settingsData?.settings) {
            try {
                const legacy = JSON.parse(settingsData.settings);
                // TODO remove legacy fallback after migrating data
                parsed.xtermPalette = legacy.xtermPalette;
            } catch {}
        }
        if (raw || Object.keys(parsed).length > 0) {
            const mapScale = (() => {
                const value = Math.abs(parseFloat(parsed.mapScale));
                return value > 0 ? value : defaultSettings.mapScale;
            })();
            const mapLimit = (() => {
                const value = parseInt(parsed.mapLimit);
                return value > 0 ? value : defaultSettings.mapLimit;
            })();
            const xtermPalette = parsed.xtermPalette === 'proper' ? 'proper' : defaultSettings.xtermPalette;
            const footerMode = typeof parsed.footerMode === 'number' ? parsed.footerMode : defaultSettings.footerMode;
            return { ...defaultSettings, ...parsed, mapScale, mapLimit, emojiLabels: !!parsed.emojiLabels, xtermPalette, footerMode };
        }
    } catch {
        // ignore malformed data
    }
    return { ...defaultSettings };
}

function save(settings: UiSettings) {
    storage.setItem('uiSettings', settings);
}

export default async function initUiSettings() {
    const button = document.getElementById('ui-settings-button') as HTMLButtonElement | null;
    const modalEl = document.getElementById('ui-settings-modal');
    if (!button || !modalEl) return;

    const modal = new Modal(modalEl);
    const contentInput = modalEl.querySelector('#ui-content-font') as HTMLInputElement;
    const objectsInput = modalEl.querySelector('#ui-objects-font') as HTMLInputElement;
    const buttonInput = modalEl.querySelector('#ui-button-size') as HTMLInputElement;
    const mapInput = modalEl.querySelector('#ui-map-scale') as HTMLInputElement;
    const mapHeightInput = modalEl.querySelector('#ui-map-height') as HTMLInputElement;
    const mapLimitInput = modalEl.querySelector('#ui-map-limit') as HTMLInputElement;
    const showButtonsInput = modalEl.querySelector('#ui-show-buttons') as HTMLInputElement;
    const emojiLabelsInput = modalEl.querySelector('#ui-emoji-labels') as HTMLInputElement;
    const footerModeInput = modalEl.querySelector('#ui-footer-mode') as HTMLSelectElement;
    const saveBtn = modalEl.querySelector('#ui-settings-save') as HTMLButtonElement;

    let current = await load();
    contentInput.value = String(current.contentFontSize);
    objectsInput.value = String(current.objectsFontSize);
    buttonInput.value = String(current.buttonSize);
    mapInput.value = String(current.mapScale);
    mapHeightInput.value = String(current.mapHeight);
    mapLimitInput.value = String(current.mapLimit);
    showButtonsInput.checked = current.showButtons;
    emojiLabelsInput.checked = current.emojiLabels;
    footerModeInput.value = String(current.footerMode);
    apply(current);

    function read(): UiSettings {
        const mapScale = (() => {
            const value = Math.abs(parseFloat(mapInput.value));
            const scale = value > 0 ? value : defaultSettings.mapScale;
            mapInput.value = String(scale);
            return scale;
        })();

        const mapLimit = (() => {
            const value = parseInt(mapLimitInput.value);
            const limit = value > 0 ? value : defaultSettings.mapLimit;
            mapLimitInput.value = String(limit);
            return limit;
        })();

        return {
            contentFontSize: parseFloat(contentInput.value) || defaultSettings.contentFontSize,
            objectsFontSize: parseFloat(objectsInput.value) || defaultSettings.objectsFontSize,
            buttonSize: parseFloat(buttonInput.value) || defaultSettings.buttonSize,
            mapScale,
            mapLimit,
            mapHeight: parseFloat(mapHeightInput.value) || defaultSettings.mapHeight,
            showButtons: showButtonsInput.checked,
            emojiLabels: emojiLabelsInput.checked,
            xtermPalette: current.xtermPalette,
            footerMode: parseInt(footerModeInput.value) || defaultSettings.footerMode
        };
    }

    saveBtn.addEventListener('click', () => {
        current = read();
        save(current);
        apply(current);
        modal.hide();
    });

    button.addEventListener('click', () => {
        modal.show();
    });
}

