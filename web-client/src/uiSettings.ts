import Modal from "bootstrap/js/dist/modal";
import {Settings} from "mudlet-map-renderer";

const mapPositions = [
    'top-overlay',
    'bottom-overlay',
    'right-overlay',
    'left-overlay',
    'top',
    'bottom',
    'right',
    'left',
] as const;

type MapPosition = (typeof mapPositions)[number];

interface UiSettings {
    contentFontSize: number;
    objectsFontSize: number;
    buttonSize: number;
    mapScale: number;
    showButtons: boolean;
    hapticFeedback: boolean;
    mapHeight: number;
    mapPosition: MapPosition;
    emojiLabels: boolean;
    fightTitleIcon: boolean;
    xtermPalette: 'arkadia' | 'proper';
    footerMode: number;
    explorationMode: boolean;
    instantMove: boolean;
    highlightCurrentRoom: boolean;
}

const defaultSettings: UiSettings = {
    contentFontSize: 0.775,
    objectsFontSize: 0.6,
    buttonSize: 1,
    mapScale: 0.30,
    showButtons: true,
    hapticFeedback: true,
    mapHeight: typeof window !== 'undefined' && window.innerWidth < 768 ? 25 : 30,
    mapPosition: 'top-overlay',
    emojiLabels: false,
    fightTitleIcon: true,
    xtermPalette: 'arkadia',
    footerMode: 0,
    explorationMode: false,
    instantMove: true,
    highlightCurrentRoom: true,
};

function apply(settings: UiSettings) {
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
        contentArea.style.setProperty('--map-size', settings.mapHeight + 'dvh');
        contentArea.setAttribute('data-map-position', settings.mapPosition);
    }
    if (document?.body) {
        document.body.dataset.mapPosition = settings.mapPosition;
    }
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
    const iframeContainer = document.getElementById('iframe-container') as HTMLElement | null;
    if (iframeContainer) {
        if (settings.mapPosition === 'top-overlay') {
            if (!iframeContainer.style.top) {
                iframeContainer.style.top = '0px';
            }
        } else {
            iframeContainer.style.top = '';
        }
    }
    const mainContainer = document.getElementById('main-container') as HTMLElement | null;
    if (mainContainer && settings.mapPosition !== 'top-overlay') {
        mainContainer.style.paddingTop = '';
    }
    const map = document.getElementById('map')
    if (map) {
        map.dispatchEvent(new CustomEvent('resize'));
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

    // Adjust grid row size for dynamically created Z and idz buttons
    const lists = document.querySelectorAll<HTMLDivElement>(
        '.mobile-z-buttons, .mobile-idz-buttons'
    );
    lists.forEach(div => {
        const baseRow = 36; // default row height in px
        div.style.gridAutoRows = baseRow * settings.buttonSize + 'px';
    });
    if ((window as any).embedded?.renderer) {
        (window as any).embedded.setZoom?.(settings.mapScale);
        (window as any).embedded.setExplorationMode?.(settings.explorationMode);
        (window as any).embedded.refresh();
    }
    Settings.instantMapMove = settings.instantMove;
    (window as any).embedded?.setInstantMove?.(settings.instantMove);
    Settings.highlightCurrentRoom = settings.highlightCurrentRoom;
    (window as any).embedded?.setHighlightCurrentRoom?.(settings.highlightCurrentRoom);
    if ((window as any).clientExtension?.eventTarget) {
        (window as any).clientExtension.eventTarget.dispatchEvent(
            new CustomEvent('uiSettings', {
                detail: {
                    mobileDirectionButtons: settings.showButtons,
                    hapticFeedback: settings.hapticFeedback,
                    emojiLabels: settings.emojiLabels,
                    xtermPalette: settings.xtermPalette,
                    footerMode: settings.footerMode,
                    fightTitleIcon: settings.fightTitleIcon,
                },
            })
        );
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('map-position-change'));
    }
}

import storage from "@client/src/storage";

async function load(): Promise<UiSettings> {
    try {
        const uiData = await storage.getItem('uiSettings');
        let raw = uiData?.uiSettings;
        let parsed: any = {};
        if (raw) {
            parsed = raw as any;
        }
        if (raw || Object.keys(parsed).length > 0) {
            const mapScale = (() => {
                const value = Math.abs(parseFloat(parsed.mapScale));
                return value > 0 ? value : defaultSettings.mapScale;
            })();
            const mapPosition = mapPositions.includes(parsed.mapPosition as MapPosition)
                ? (parsed.mapPosition as MapPosition)
                : defaultSettings.mapPosition;
            const xtermPalette = parsed.xtermPalette === 'proper' ? 'proper' : defaultSettings.xtermPalette;
            const footerMode = typeof parsed.footerMode === 'number' ? parsed.footerMode : defaultSettings.footerMode;
            const explorationMode = !!parsed.explorationMode;
            const fightTitleIcon = typeof parsed.fightTitleIcon === 'boolean' ? parsed.fightTitleIcon : defaultSettings.fightTitleIcon;
            const hapticFeedback = typeof parsed.hapticFeedback === 'boolean' ? parsed.hapticFeedback : defaultSettings.hapticFeedback;
            const instantMove = typeof parsed.instantMove === 'boolean' ? parsed.instantMove : defaultSettings.instantMove;
            const highlightCurrentRoom = typeof parsed.highlightCurrentRoom === 'boolean'
                ? parsed.highlightCurrentRoom
                : defaultSettings.highlightCurrentRoom;
            return { ...defaultSettings, ...parsed, mapScale, mapPosition, emojiLabels: !!parsed.emojiLabels, xtermPalette, footerMode, explorationMode, fightTitleIcon, hapticFeedback, instantMove, highlightCurrentRoom };
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
    const mapPositionInput = modalEl.querySelector('#ui-map-position') as HTMLSelectElement;
    const explorationInput = modalEl.querySelector('#ui-exploration-mode') as HTMLInputElement;
    const explorationStats = modalEl.querySelector('#ui-exploration-stats') as HTMLElement | null;
    const showButtonsInput = modalEl.querySelector('#ui-show-buttons') as HTMLInputElement;
    const hapticFeedbackInput = modalEl.querySelector('#ui-haptic-feedback') as HTMLInputElement;
    const emojiLabelsInput = modalEl.querySelector('#ui-emoji-labels') as HTMLInputElement;
    const fightTitleIconInput = modalEl.querySelector('#ui-fight-title-icon') as HTMLInputElement;
    const xtermPaletteInput = modalEl.querySelector('#ui-xterm-palette') as HTMLSelectElement;
    const footerModeInput = modalEl.querySelector('#ui-footer-mode') as HTMLSelectElement;
    const instantMoveInput = modalEl.querySelector('#ui-instant-move') as HTMLInputElement;
    const highlightCurrentRoomInput = modalEl.querySelector('#ui-highlight-current-room') as HTMLInputElement;
    const saveBtn = modalEl.querySelector('#ui-settings-save') as HTMLButtonElement;

    let current = await load();
    contentInput.value = String(current.contentFontSize);
    objectsInput.value = String(current.objectsFontSize);
    buttonInput.value = String(current.buttonSize);
    mapInput.value = String(current.mapScale);
    mapHeightInput.value = String(current.mapHeight);
    mapPositionInput.value = current.mapPosition;
    explorationInput.checked = current.explorationMode;
    showButtonsInput.checked = current.showButtons;
    hapticFeedbackInput.checked = current.hapticFeedback;
    emojiLabelsInput.checked = current.emojiLabels;
    fightTitleIconInput.checked = current.fightTitleIcon;
    xtermPaletteInput.value = current.xtermPalette;
    footerModeInput.value = String(current.footerMode);
    instantMoveInput.checked = current.instantMove;
    highlightCurrentRoomInput.checked = current.highlightCurrentRoom;
    apply(current);

    const updateMapScale = (scale: number) => {
        mapInput.value = String(scale);
        current = { ...current, mapScale: scale };
    };

    const handleStorageChange = (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
        const uiSettingsChange = changes.uiSettings;
        if (!uiSettingsChange || !uiSettingsChange.newValue) {
            return;
        }
        const newValue = uiSettingsChange.newValue;
        const scaleValue = typeof newValue.mapScale === 'number'
            ? newValue.mapScale
            : parseFloat(newValue.mapScale);
        const normalizedScale = Number.isFinite(scaleValue) && scaleValue > 0
            ? scaleValue
            : defaultSettings.mapScale;
        updateMapScale(normalizedScale);
    };

    storage.onChanged?.addListener(handleStorageChange);

    function refreshExplorationStats() {
        const map = (window as any).embedded;
        if (map?.getVisitedCount && map?.getRoomCount && explorationStats) {
            const visited = map.getVisitedCount();
            const total = map.getRoomCount();
            explorationStats.textContent = `(${visited}/${total})`;
        }
    }

    function read(): UiSettings {
        const mapScale = (() => {
            const value = Math.abs(parseFloat(mapInput.value));
            const scale = value > 0 ? value : defaultSettings.mapScale;
            mapInput.value = String(scale);
            return scale;
        })();

        return {
            contentFontSize: parseFloat(contentInput.value) || defaultSettings.contentFontSize,
            objectsFontSize: parseFloat(objectsInput.value) || defaultSettings.objectsFontSize,
            buttonSize: parseFloat(buttonInput.value) || defaultSettings.buttonSize,
            mapScale,
            mapHeight: parseFloat(mapHeightInput.value) || defaultSettings.mapHeight,
            mapPosition: (mapPositionInput.value as MapPosition) || defaultSettings.mapPosition,
            showButtons: showButtonsInput.checked,
            hapticFeedback: hapticFeedbackInput.checked,
            emojiLabels: emojiLabelsInput.checked,
            fightTitleIcon: fightTitleIconInput.checked,
            xtermPalette: (xtermPaletteInput.value as 'arkadia' | 'proper') || defaultSettings.xtermPalette,
            footerMode: parseInt(footerModeInput.value) || defaultSettings.footerMode,
            explorationMode: explorationInput.checked,
            instantMove: instantMoveInput.checked,
            highlightCurrentRoom: highlightCurrentRoomInput.checked,
        };
    }

    saveBtn.addEventListener('click', () => {
        current = read();
        save(current);
        apply(current);
        modal.hide();
    });

    button.addEventListener('click', () => {
        refreshExplorationStats();
        modal.show();
    });
}

