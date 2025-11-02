import Modal from "bootstrap/js/dist/modal";
import {Settings} from "mudlet-map-renderer";
import {ensureFontLoaded, isUiFontSelection, UiFontSelection} from "./fontLoader";
import eventBus from "@client/src/eventBus.ts";
import type { UiSettingsEventPayload } from "@client/src/types/uiSettingsEvent.ts";

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

export interface UiSettings {
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
    labelRenderMode: 'image' | 'data';
    transparentLabels: boolean;
    outputBackground: string;
    clearInputOnSend: boolean;
    showTransportLabel: boolean;
    showCombatTimer: boolean;
    fontFamily: UiFontSelection;
    customFontUrl: string;
    customFontFamily: string;
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
    labelRenderMode: 'data',
    transparentLabels: true,
    outputBackground: '#242424',
    clearInputOnSend: false,
    showTransportLabel: true,
    showCombatTimer: true,
    fontFamily: 'default',
    customFontUrl: '',
    customFontFamily: '',
};

const genericFontFamilyNames = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
]);

function normalizeFontFamilyCandidate(candidate: string): string | undefined {
    const primary = candidate.split(',')[0]?.trim();
    if (!primary) {
        return undefined;
    }
    const withoutQuotes = primary.replace(/^['"]+|['"]+$/g, '').trim();
    if (!withoutQuotes) {
        return undefined;
    }
    if (genericFontFamilyNames.has(withoutQuotes.toLowerCase())) {
        return undefined;
    }
    return withoutQuotes;
}

function extractFontFamilyFromCss(css: string): string | undefined {
    const fontFaceRegex = /@font-face\s*{[\s\S]*?}/gi;
    let match: RegExpExecArray | null;
    while ((match = fontFaceRegex.exec(css))) {
        const block = match[0];
        const familyMatch = /font-family\s*:\s*([^;]+);/i.exec(block);
        if (!familyMatch) {
            continue;
        }
        const normalized = normalizeFontFamilyCandidate(familyMatch[1]);
        if (normalized) {
            return normalized;
        }
    }
    const fallbackMatch = /font-family\s*:\s*([^;]+);/i.exec(css);
    return fallbackMatch ? normalizeFontFamilyCandidate(fallbackMatch[1]) : undefined;
}

function guessFontFamilyFromUrl(href: string): string | undefined {
    try {
        const url = new URL(href);
        let familyParam: string | null = null;
        url.searchParams.forEach((value, key) => {
            if (!familyParam && key.toLowerCase() === 'family' && value) {
                familyParam = value;
            }
        });
        if (!familyParam) {
            return undefined;
        }
        const familyName = familyParam.split(':')[0]?.trim();
        return familyName ? normalizeFontFamilyCandidate(familyName) : undefined;
    } catch {
        return undefined;
    }
}

async function guessFontFamilyFromStylesheet(href: string): Promise<string | undefined> {
    if (!/^https?:\/\//i.test(href)) {
        return undefined;
    }
    if (typeof fetch !== 'function') {
        return guessFontFamilyFromUrl(href);
    }
    try {
        const response = await fetch(href, { mode: 'cors' });
        if (!response.ok) {
            return guessFontFamilyFromUrl(href);
        }
        const css = await response.text();
        return extractFontFamilyFromCss(css) ?? guessFontFamilyFromUrl(href);
    } catch {
        return guessFontFamilyFromUrl(href);
    }
}

function resolveOutputFontFamily(selection: UiFontSelection, customFontFamily: string): string | undefined {
    switch (selection) {
    case 'fira-code':
        return '"Fira Code", monospace';
    case 'jetbrains-mono':
        return '"JetBrains Mono", monospace';
    case 'cascadia-mono':
        return '"Cascadia Mono", monospace';
    case 'custom': {
        const trimmed = customFontFamily.trim();
        if (!trimmed) {
            return undefined;
        }
        const normalized = /['",]/.test(trimmed)
            ? trimmed
            : `"${trimmed}"`;
        return `${normalized}, monospace`;
    }
    default:
        return undefined;
    }
}

function apply(settings: UiSettings) {
    const customHref = settings.customFontUrl?.trim();
    const normalizedHref = customHref && /^https?:\/\//i.test(customHref) ? customHref : undefined;
    ensureFontLoaded(settings.fontFamily, normalizedHref);
    const resolvedFontFamily = resolveOutputFontFamily(settings.fontFamily, settings.customFontFamily ?? '');
    const contentArea = document.getElementById('content-area');
    if (contentArea) {
        contentArea.style.setProperty('--map-size', settings.mapHeight + 'vh');
        contentArea.setAttribute('data-map-position', settings.mapPosition);
    }
    if (document?.body) {
        document.body.dataset.mapPosition = settings.mapPosition;
    }
    const content = document.getElementById('main_text_output_msg_wrapper');
    if (content) {
        if (resolvedFontFamily) {
            content.style.fontFamily = resolvedFontFamily;
        } else {
            content.style.removeProperty('font-family');
        }
        content.style.fontSize = settings.contentFontSize + 'rem';
        content.style.backgroundColor = settings.outputBackground;
    }
    const charState = document.getElementById('char-state');
    if (charState) {
        charState.style.fontSize = settings.contentFontSize + 'rem';
        charState.setAttribute('data-footer-mode', String(settings.footerMode));
    }
    const combatTimer = document.getElementById('combat-timer');
    if (combatTimer) {
        combatTimer.dataset.enabled = settings.showCombatTimer ? '1' : '0';
        if (!settings.showCombatTimer) {
            combatTimer.style.display = 'none';
            combatTimer.textContent = '';
            combatTimer.className = '';
        }
    }
    const objects = document.getElementById('objects-list');
    if (objects) {
        if (resolvedFontFamily) {
            objects.style.fontFamily = resolvedFontFamily;
        } else {
            objects.style.removeProperty('font-family');
        }
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
    const splitBottom = document.getElementById('split-bottom');
    if (splitBottom) {
        splitBottom.style.backgroundColor = settings.outputBackground;
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
    Settings.transparentLabels = settings.transparentLabels;
    const labelRenderMode = settings.transparentLabels ? 'data' : settings.labelRenderMode;
    Settings.labelRenderMode = labelRenderMode;
    (window as any).embedded?.setTransparentLabels?.(settings.transparentLabels);
    (window as any).embedded?.setLabelRenderMode?.(labelRenderMode);
    Settings.instantMapMove = settings.instantMove;
    (window as any).embedded?.setInstantMove?.(settings.instantMove);
    Settings.highlightCurrentRoom = settings.highlightCurrentRoom;
    (window as any).embedded?.setHighlightCurrentRoom?.(settings.highlightCurrentRoom);
    const payload: UiSettingsEventPayload = {
        mobileDirectionButtons: settings.showButtons,
        hapticFeedback: settings.hapticFeedback,
        emojiLabels: settings.emojiLabels,
        xtermPalette: settings.xtermPalette,
        footerMode: settings.footerMode,
        fightTitleIcon: settings.fightTitleIcon,
        clearInputOnSend: settings.clearInputOnSend,
        showTransportLabel: settings.showTransportLabel,
        showCombatTimer: settings.showCombatTimer,
    };
    eventBus.emit('uiSettings', payload);
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
            const transparentLabels = typeof parsed.transparentLabels === 'boolean'
                ? parsed.transparentLabels
                : defaultSettings.transparentLabels;
            const labelRenderMode = parsed.labelRenderMode === 'image' || parsed.labelRenderMode === 'data'
                ? parsed.labelRenderMode
                : defaultSettings.labelRenderMode;
            const effectiveLabelRenderMode = transparentLabels ? 'data' : labelRenderMode;
            const xtermPalette = parsed.xtermPalette === 'proper' ? 'proper' : defaultSettings.xtermPalette;
            const footerMode = typeof parsed.footerMode === 'number' ? parsed.footerMode : defaultSettings.footerMode;
            const explorationMode = !!parsed.explorationMode;
            const fightTitleIcon = typeof parsed.fightTitleIcon === 'boolean' ? parsed.fightTitleIcon : defaultSettings.fightTitleIcon;
            const hapticFeedback = typeof parsed.hapticFeedback === 'boolean' ? parsed.hapticFeedback : defaultSettings.hapticFeedback;
            const instantMove = typeof parsed.instantMove === 'boolean' ? parsed.instantMove : defaultSettings.instantMove;
            const highlightCurrentRoom = typeof parsed.highlightCurrentRoom === 'boolean'
                ? parsed.highlightCurrentRoom
                : defaultSettings.highlightCurrentRoom;
            const outputBackground = typeof parsed.outputBackground === 'string'
                && /^#[0-9a-f]{6}$/i.test(parsed.outputBackground.trim())
                    ? parsed.outputBackground.trim()
                    : defaultSettings.outputBackground;
            const fontFamily = isUiFontSelection(parsed.fontFamily)
                ? parsed.fontFamily
                : defaultSettings.fontFamily;
            const customFontUrl = typeof parsed.customFontUrl === 'string'
                ? parsed.customFontUrl.trim()
                : defaultSettings.customFontUrl;
            const normalizedCustomFontUrl = /^https?:\/\//i.test(customFontUrl)
                ? customFontUrl
                : defaultSettings.customFontUrl;
            const customFontFamily = typeof parsed.customFontFamily === 'string'
                ? parsed.customFontFamily.trim()
                : defaultSettings.customFontFamily;
            const clearInputOnSend = typeof parsed.clearInputOnSend === 'boolean'
                ? parsed.clearInputOnSend
                : defaultSettings.clearInputOnSend;
            const showTransportLabel = typeof parsed.showTransportLabel === 'boolean'
                ? parsed.showTransportLabel
                : defaultSettings.showTransportLabel;
            const showCombatTimer = typeof parsed.showCombatTimer === 'boolean'
                ? parsed.showCombatTimer
                : defaultSettings.showCombatTimer;
            return {
                ...defaultSettings,
                ...parsed,
                mapScale,
                mapPosition,
                emojiLabels: !!parsed.emojiLabels,
                xtermPalette,
                footerMode,
                explorationMode,
                fightTitleIcon,
                hapticFeedback,
                instantMove,
                highlightCurrentRoom,
                transparentLabels,
                labelRenderMode: effectiveLabelRenderMode,
                outputBackground,
                clearInputOnSend,
                showTransportLabel,
                showCombatTimer,
                fontFamily,
                customFontUrl: normalizedCustomFontUrl,
                customFontFamily,
            };
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
    const labelRenderModeInput = modalEl.querySelector('#ui-label-render-mode') as HTMLSelectElement;
    const transparentLabelsInput = modalEl.querySelector('#ui-transparent-labels') as HTMLInputElement;
    const outputBackgroundInput = modalEl.querySelector('#ui-output-background') as HTMLInputElement;
    const outputBackgroundReset = modalEl.querySelector('#ui-output-background-reset') as HTMLButtonElement | null;
    const clearInputOnSendInput = modalEl.querySelector('#ui-clear-input') as HTMLInputElement;
    const showTransportLabelInput = modalEl.querySelector('#ui-show-transport-label') as HTMLInputElement;
    const showCombatTimerInput = modalEl.querySelector('#ui-show-combat-timer') as HTMLInputElement;
    const fontFamilyInput = modalEl.querySelector('#ui-font-family') as HTMLSelectElement;
    const customFontSettings = modalEl.querySelector('#ui-custom-font-settings') as HTMLElement | null;
    const customFontUrlInput = modalEl.querySelector('#ui-custom-font-url') as HTMLInputElement;
    const customFontFamilyInput = modalEl.querySelector('#ui-custom-font-family') as HTMLInputElement;
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
    labelRenderModeInput.value = current.labelRenderMode;
    transparentLabelsInput.checked = current.transparentLabels;
    outputBackgroundInput.value = current.outputBackground;
    clearInputOnSendInput.checked = current.clearInputOnSend;
    showTransportLabelInput.checked = current.showTransportLabel;
    showCombatTimerInput.checked = current.showCombatTimer;
    fontFamilyInput.value = current.fontFamily;
    customFontUrlInput.value = current.customFontUrl;
    customFontFamilyInput.value = current.customFontFamily;
    const updateLabelRenderModeState = () => {
        if (transparentLabelsInput.checked) {
            labelRenderModeInput.value = 'data';
            labelRenderModeInput.disabled = true;
        } else {
            labelRenderModeInput.disabled = false;
        }
    };
    updateLabelRenderModeState();
    const initialCustomFontFamily = customFontFamilyInput.value.trim();
    const initialGuessFromUrl = current.customFontUrl ? guessFontFamilyFromUrl(current.customFontUrl) : undefined;
    let lastAutomaticFontFamily = '';
    let customFontFamilyTouched = false;
    if (initialCustomFontFamily) {
        if (initialGuessFromUrl && initialGuessFromUrl === initialCustomFontFamily) {
            lastAutomaticFontFamily = initialCustomFontFamily;
            customFontFamilyTouched = false;
        } else {
            customFontFamilyTouched = true;
        }
    }
    let fontGuessTimeout: number | undefined;
    let fontGuessToken = 0;

    const applyAutomaticFontFamily = (family: string) => {
        customFontFamilyInput.value = family;
        lastAutomaticFontFamily = family;
        customFontFamilyTouched = false;
    };

    const clearAutomaticFontFamily = () => {
        if (!customFontFamilyTouched && customFontFamilyInput.value.trim() === lastAutomaticFontFamily) {
            customFontFamilyInput.value = '';
        }
        lastAutomaticFontFamily = '';
    };

    const triggerFontFamilyGuess = async () => {
        const isCustomSelected = fontFamilyInput.value === 'custom';
        if (!isCustomSelected) {
            fontGuessToken++;
            return;
        }
        const href = customFontUrlInput.value.trim();
        if (!href) {
            fontGuessToken++;
            clearAutomaticFontFamily();
            return;
        }
        if (!/^https?:\/\//i.test(href)) {
            fontGuessToken++;
            clearAutomaticFontFamily();
            return;
        }
        const currentToken = ++fontGuessToken;
        const guess = await guessFontFamilyFromStylesheet(href);
        if (currentToken !== fontGuessToken) {
            return;
        }
        if (!guess) {
            clearAutomaticFontFamily();
            return;
        }
        const currentValue = customFontFamilyInput.value.trim();
        if (customFontFamilyTouched && currentValue && currentValue !== lastAutomaticFontFamily) {
            return;
        }
        applyAutomaticFontFamily(guess);
    };

    const scheduleFontFamilyGuess = () => {
        if (fontGuessTimeout !== undefined) {
            clearTimeout(fontGuessTimeout);
        }
        // @ts-ignore
        fontGuessTimeout = setTimeout(() => {
            fontGuessTimeout = undefined;
            void triggerFontFamilyGuess();
        }, 300);
    };

    const updateCustomFontState = () => {
        const customSelected = fontFamilyInput.value === 'custom';
        if (customFontSettings) {
            customFontSettings.classList.toggle('d-none', !customSelected);
        }
        customFontUrlInput.disabled = !customSelected;
        customFontFamilyInput.disabled = !customSelected;
        if (customSelected && !customFontFamilyTouched) {
            scheduleFontFamilyGuess();
        }
    };
    updateCustomFontState();
    if (!customFontFamilyTouched) {
        scheduleFontFamilyGuess();
    }
    outputBackgroundReset?.addEventListener('click', () => {
        outputBackgroundInput.value = defaultSettings.outputBackground;
    });
    apply(current);

    transparentLabelsInput.addEventListener('change', updateLabelRenderModeState);
    fontFamilyInput.addEventListener('change', () => {
        updateCustomFontState();
        if (fontFamilyInput.value !== 'custom') {
            clearAutomaticFontFamily();
        }
    });

    customFontUrlInput.addEventListener('input', scheduleFontFamilyGuess);
    customFontUrlInput.addEventListener('change', scheduleFontFamilyGuess);
    customFontUrlInput.addEventListener('blur', scheduleFontFamilyGuess);

    customFontFamilyInput.addEventListener('input', () => {
        const trimmed = customFontFamilyInput.value.trim();
        if (!trimmed) {
            customFontFamilyTouched = false;
            lastAutomaticFontFamily = '';
            scheduleFontFamilyGuess();
            return;
        }
        if (trimmed !== lastAutomaticFontFamily) {
            customFontFamilyTouched = true;
            lastAutomaticFontFamily = '';
        }
    });

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

        const backgroundValue = /^#[0-9a-f]{6}$/i.test(outputBackgroundInput.value)
            ? outputBackgroundInput.value
            : defaultSettings.outputBackground;

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
            labelRenderMode: (labelRenderModeInput.value === 'data' ? 'data' : 'image'),
            transparentLabels: transparentLabelsInput.checked,
            outputBackground: backgroundValue,
            clearInputOnSend: clearInputOnSendInput.checked,
            showTransportLabel: showTransportLabelInput.checked,
            showCombatTimer: showCombatTimerInput.checked,
            fontFamily: isUiFontSelection(fontFamilyInput.value) ? fontFamilyInput.value : defaultSettings.fontFamily,
            customFontUrl: (() => {
                const value = customFontUrlInput.value.trim();
                return /^https?:\/\//i.test(value) ? value : '';
            })(),
            customFontFamily: customFontFamilyInput.value.trim(),
        };
    }

    saveBtn.addEventListener('click', () => {
        current = read();
        if (current.transparentLabels) {
            current = { ...current, labelRenderMode: 'data' };
        }
        save(current);
        apply(current);
        modal.hide();
    });

    button.addEventListener('click', () => {
        refreshExplorationStats();
        modal.show();
    });
}
