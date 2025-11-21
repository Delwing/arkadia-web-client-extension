import Modal from "bootstrap/js/dist/modal";
import {Settings} from "mudlet-map-renderer";
import {ensureFontLoaded, isUiFontSelection, UiFontSelection} from "./fontLoader";
import eventBus from "@modules/core/eventBus";
import type { UiSettingsEventPayload } from "@client/types/uiSettingsEvent";
import { CUSTOM_SOUNDS_STORAGE_KEY, CustomSound, getCustomSounds, saveCustomSounds } from "@modules/core/customSounds";

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function calculateBase64Size(dataUrl: string): number {
    const base64String = dataUrl.split(',')[1] || '';
    const padding = (base64String.match(/=/g) || []).length;
    return (base64String.length * 3 / 4) - padding;
}

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
    showClockDisplay: boolean;
    fontFamily: UiFontSelection;
    customFontUrl: string;
    customFontFamily: string;
    autoLowercaseCommands: boolean;
    customBeepSoundKey?: string;
    mapRoomSize: number;
    mapLineWidth: number;
    mapPlayerMarkerStrokeColor: string;
    mapPlayerMarkerStrokeAlpha: number;
    mapPlayerMarkerFillColor: string;
    mapPlayerMarkerFillAlpha: number;
    mapPlayerMarkerStrokeWidth: number;
    mapPlayerMarkerSizeFactor: number;
    mapPlayerMarkerDashEnabled: boolean;
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
    showClockDisplay: true,
    fontFamily: 'default',
    customFontUrl: '',
    customFontFamily: '',
    autoLowercaseCommands: false,
    customBeepSoundKey: undefined,
    mapRoomSize: 0.6,
    mapLineWidth: 0.025,
    mapPlayerMarkerStrokeColor: '#00e5b2',
    mapPlayerMarkerStrokeAlpha: 1,
    mapPlayerMarkerFillColor: '#00e5b2',
    mapPlayerMarkerFillAlpha: 0,
    mapPlayerMarkerStrokeWidth: 0.1,
    mapPlayerMarkerSizeFactor: 1.7,
    mapPlayerMarkerDashEnabled: true,
};

const MIN_MAP_SCALE = 0.01;

function clampMapScale(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_MAP_SCALE;
    }
    const normalized = Math.abs(value);
    return normalized >= MIN_MAP_SCALE ? normalized : MIN_MAP_SCALE;
}

function normalizeMapScale(value: unknown, fallback = defaultSettings.mapScale): number {
    const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return Math.max(fallback, MIN_MAP_SCALE);
    }
    return clampMapScale(numericValue);
}

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
    const mapScale = normalizeMapScale(settings.mapScale);
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
    const clockDisplay = document.getElementById('clock-display');
    if (clockDisplay) {
        clockDisplay.dataset.enabled = settings.showClockDisplay ? '1' : '0';
        if (!settings.showClockDisplay) {
            clockDisplay.style.display = 'none';
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
    const embedded = (globalThis as any).embedded;
    if (embedded?.renderer) {
        embedded.setZoom?.(mapScale);
        embedded.setExplorationMode?.(settings.explorationMode);
        embedded.refresh();
    }
    Settings.transparentLabels = settings.transparentLabels;
    const labelRenderMode = settings.transparentLabels ? 'data' : settings.labelRenderMode;
    Settings.labelRenderMode = labelRenderMode;
    embedded?.setTransparentLabels?.(settings.transparentLabels);
    embedded?.setLabelRenderMode?.(labelRenderMode);
    Settings.instantMapMove = settings.instantMove;
    embedded?.setInstantMove?.(settings.instantMove);
    Settings.highlightCurrentRoom = settings.highlightCurrentRoom;
    embedded?.setHighlightCurrentRoom?.(settings.highlightCurrentRoom);
    Settings.roomSize = settings.mapRoomSize;
    Settings.lineWidth = settings.mapLineWidth;
    Settings.playerMarker = {
        strokeColor: settings.mapPlayerMarkerStrokeColor,
        strokeAlpha: settings.mapPlayerMarkerStrokeAlpha,
        fillColor: settings.mapPlayerMarkerFillColor,
        fillAlpha: settings.mapPlayerMarkerFillAlpha,
        strokeWidth: settings.mapPlayerMarkerStrokeWidth,
        sizeFactor: settings.mapPlayerMarkerSizeFactor,
        dashEnabled: settings.mapPlayerMarkerDashEnabled,
    };
    embedded?.refresh();
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
        showClockDisplay: settings.showClockDisplay,
        autoLowercaseCommands: settings.autoLowercaseCommands,
    };
    eventBus.emit('uiSettings', payload);
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('map-position-change'));
    }
}

import storage from "@modules/core/storage";

async function load(): Promise<UiSettings> {
    try {
        const uiData = await storage.getItem('uiSettings');
        const raw = uiData?.uiSettings;
        let parsed: any = {};
        if (raw) {
            parsed = raw as any;
        }
        if (raw || Object.keys(parsed).length > 0) {
            const mapScale = normalizeMapScale(parsed.mapScale);
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
            const showClockDisplay = typeof parsed.showClockDisplay === 'boolean'
                ? parsed.showClockDisplay
                : defaultSettings.showClockDisplay;
            const autoLowercaseCommands = typeof parsed.autoLowercaseCommands === 'boolean'
                ? parsed.autoLowercaseCommands
                : defaultSettings.autoLowercaseCommands;
            const customBeepSoundKey = typeof parsed.customBeepSoundKey === 'string'
                ? parsed.customBeepSoundKey || undefined
                : defaultSettings.customBeepSoundKey;
            const mapRoomSize = typeof parsed.mapRoomSize === 'number' && parsed.mapRoomSize > 0
                ? parsed.mapRoomSize
                : defaultSettings.mapRoomSize;
            const mapLineWidth = typeof parsed.mapLineWidth === 'number' && parsed.mapLineWidth > 0
                ? parsed.mapLineWidth
                : defaultSettings.mapLineWidth;
            const mapPlayerMarkerStrokeColor = typeof parsed.mapPlayerMarkerStrokeColor === 'string'
                ? parsed.mapPlayerMarkerStrokeColor
                : defaultSettings.mapPlayerMarkerStrokeColor;
            const mapPlayerMarkerStrokeAlpha = typeof parsed.mapPlayerMarkerStrokeAlpha === 'number'
                ? parsed.mapPlayerMarkerStrokeAlpha
                : defaultSettings.mapPlayerMarkerStrokeAlpha;
            const mapPlayerMarkerFillColor = typeof parsed.mapPlayerMarkerFillColor === 'string'
                ? parsed.mapPlayerMarkerFillColor
                : defaultSettings.mapPlayerMarkerFillColor;
            const mapPlayerMarkerFillAlpha = typeof parsed.mapPlayerMarkerFillAlpha === 'number'
                ? parsed.mapPlayerMarkerFillAlpha
                : defaultSettings.mapPlayerMarkerFillAlpha;
            const mapPlayerMarkerStrokeWidth = typeof parsed.mapPlayerMarkerStrokeWidth === 'number'
                ? parsed.mapPlayerMarkerStrokeWidth
                : defaultSettings.mapPlayerMarkerStrokeWidth;
            const mapPlayerMarkerSizeFactor = typeof parsed.mapPlayerMarkerSizeFactor === 'number'
                ? parsed.mapPlayerMarkerSizeFactor
                : defaultSettings.mapPlayerMarkerSizeFactor;
            const mapPlayerMarkerDashEnabled = typeof parsed.mapPlayerMarkerDashEnabled === 'boolean'
                ? parsed.mapPlayerMarkerDashEnabled
                : defaultSettings.mapPlayerMarkerDashEnabled;
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
                showClockDisplay,
                fontFamily,
                customFontUrl: normalizedCustomFontUrl,
                customFontFamily,
                autoLowercaseCommands,
                customBeepSoundKey,
                mapRoomSize,
                mapLineWidth,
                mapPlayerMarkerStrokeColor,
                mapPlayerMarkerStrokeAlpha,
                mapPlayerMarkerFillColor,
                mapPlayerMarkerFillAlpha,
                mapPlayerMarkerStrokeWidth,
                mapPlayerMarkerSizeFactor,
                mapPlayerMarkerDashEnabled,
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
    const showClockDisplayInput = modalEl.querySelector('#ui-show-clock-display') as HTMLInputElement;
    const fontFamilyInput = modalEl.querySelector('#ui-font-family') as HTMLSelectElement;
    const customFontSettings = modalEl.querySelector('#ui-custom-font-settings') as HTMLElement | null;
    const customFontUrlInput = modalEl.querySelector('#ui-custom-font-url') as HTMLInputElement;
    const customFontFamilyInput = modalEl.querySelector('#ui-custom-font-family') as HTMLInputElement;
    const autoLowercaseCommandsInput = modalEl.querySelector('#ui-auto-lowercase-commands') as HTMLInputElement;
    const customBeepSoundInput = modalEl.querySelector('#ui-custom-beep-sound') as HTMLSelectElement;
    const customBeepFileInput = modalEl.querySelector('#ui-custom-beep-file') as HTMLInputElement;
    const mapRoomSizeInput = modalEl.querySelector('#ui-map-room-size') as HTMLInputElement;
    const mapRoomSizeValue = modalEl.querySelector('#ui-map-room-size-value') as HTMLSpanElement;
    const mapLineWidthInput = modalEl.querySelector('#ui-map-line-width') as HTMLInputElement;
    const mapLineWidthValue = modalEl.querySelector('#ui-map-line-width-value') as HTMLSpanElement;
    const mapPlayerMarkerStrokeColorInput = modalEl.querySelector('#ui-map-player-marker-stroke-color') as HTMLInputElement;
    const mapPlayerMarkerFillColorInput = modalEl.querySelector('#ui-map-player-marker-fill-color') as HTMLInputElement;
    const mapPlayerMarkerStrokeAlphaInput = modalEl.querySelector('#ui-map-player-marker-stroke-alpha') as HTMLInputElement;
    const mapPlayerMarkerStrokeAlphaValue = modalEl.querySelector('#ui-map-player-marker-stroke-alpha-value') as HTMLSpanElement;
    const mapPlayerMarkerFillAlphaInput = modalEl.querySelector('#ui-map-player-marker-fill-alpha') as HTMLInputElement;
    const mapPlayerMarkerFillAlphaValue = modalEl.querySelector('#ui-map-player-marker-fill-alpha-value') as HTMLSpanElement;
    const mapPlayerMarkerStrokeWidthInput = modalEl.querySelector('#ui-map-player-marker-stroke-width') as HTMLInputElement;
    const mapPlayerMarkerStrokeWidthValue = modalEl.querySelector('#ui-map-player-marker-stroke-width-value') as HTMLSpanElement;
    const mapPlayerMarkerSizeFactorInput = modalEl.querySelector('#ui-map-player-marker-size-factor') as HTMLInputElement;
    const mapPlayerMarkerSizeFactorValue = modalEl.querySelector('#ui-map-player-marker-size-factor-value') as HTMLSpanElement;
    const mapPlayerMarkerDashEnabledInput = modalEl.querySelector('#ui-map-player-marker-dash-enabled') as HTMLInputElement;
    const saveBtn = modalEl.querySelector('#ui-settings-save') as HTMLButtonElement;

    let current = await load();
    let customSounds: CustomSound[] = [];
    const customSoundsRef = { current: customSounds };

    const loadCustomSounds = async () => {
        try {
            customSounds = await getCustomSounds();
            customSoundsRef.current = customSounds;
            populateCustomBeepOptions();
        } catch (error) {
            console.error('Failed to load custom sounds', error);
        }
    };

    const populateCustomBeepOptions = () => {
        if (!customBeepSoundInput) return;
        const currentValue = customBeepSoundInput.value;
        customBeepSoundInput.innerHTML = '<option value="">Domyślny beep</option>';
        customSounds.forEach(sound => {
            const option = document.createElement('option');
            option.value = sound.key;
            option.textContent = sound.name;
            customBeepSoundInput.appendChild(option);
        });
        const uploadOption = document.createElement('option');
        uploadOption.value = '__upload__';
        uploadOption.textContent = 'Dodaj dźwięk…';
        customBeepSoundInput.appendChild(uploadOption);
        if (currentValue) {
            customBeepSoundInput.value = currentValue;
        }
    };

    const handleCustomBeepFileChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0] ?? null;
        target.value = '';
        if (!file) {
            // User cancelled file selection - revert to current setting
            if (customBeepSoundInput) {
                customBeepSoundInput.value = current.customBeepSoundKey || '';
            }
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                if (customBeepSoundInput) {
                    customBeepSoundInput.value = current.customBeepSoundKey || '';
                }
                return;
            }
            const baseName = file.name.replace(/\.[^/.]+$/, '') || file.name;
            const existingKeys = new Set(customSoundsRef.current.map(sound => sound.key));
            const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            const prefix = slug ? `user:${slug}` : `user:${Date.now()}`;
            let key = prefix;
            let counter = 1;
            while (existingKeys.has(key)) {
                key = `${prefix}-${counter++}`;
            }
            const sound: CustomSound = { key, name: baseName, data: result };
            const nextSounds = [...customSoundsRef.current, sound];
            customSoundsRef.current = nextSounds;
            customSounds = nextSounds;
            void saveCustomSounds(nextSounds)
                .then(() => {
                    // Repopulate options with the new sound
                    populateCustomBeepOptions();
                    // Select the newly uploaded sound immediately
                    if (customBeepSoundInput) {
                        customBeepSoundInput.value = sound.key;
                    }
                    // Update current settings to reflect the new selection
                    current = { ...current, customBeepSoundKey: sound.key };
                })
                .catch(error => {
                    console.error('Failed to save custom sound', error);
                    if (customBeepSoundInput) {
                        customBeepSoundInput.value = current.customBeepSoundKey || '';
                    }
                });
        };
        reader.onerror = () => {
            if (customBeepSoundInput) {
                customBeepSoundInput.value = current.customBeepSoundKey || '';
            }
        };
        reader.readAsDataURL(file);
    };

    await loadCustomSounds();

    const populateFormInputs = (settings: UiSettings) => {
        contentInput.value = String(settings.contentFontSize);
        objectsInput.value = String(settings.objectsFontSize);
        buttonInput.value = String(settings.buttonSize);
        mapInput.value = String(settings.mapScale);
        mapHeightInput.value = String(settings.mapHeight);
        mapPositionInput.value = settings.mapPosition;
        explorationInput.checked = settings.explorationMode;
        showButtonsInput.checked = settings.showButtons;
        hapticFeedbackInput.checked = settings.hapticFeedback;
        emojiLabelsInput.checked = settings.emojiLabels;
        fightTitleIconInput.checked = settings.fightTitleIcon;
        xtermPaletteInput.value = settings.xtermPalette;
        footerModeInput.value = String(settings.footerMode);
        instantMoveInput.checked = settings.instantMove;
        highlightCurrentRoomInput.checked = settings.highlightCurrentRoom;
        labelRenderModeInput.value = settings.labelRenderMode;
        transparentLabelsInput.checked = settings.transparentLabels;
        outputBackgroundInput.value = settings.outputBackground;
        clearInputOnSendInput.checked = settings.clearInputOnSend;
        showTransportLabelInput.checked = settings.showTransportLabel;
        showCombatTimerInput.checked = settings.showCombatTimer;
        showClockDisplayInput.checked = settings.showClockDisplay;
        fontFamilyInput.value = settings.fontFamily;
        customFontUrlInput.value = settings.customFontUrl;
        customFontFamilyInput.value = settings.customFontFamily;
        autoLowercaseCommandsInput.checked = settings.autoLowercaseCommands;
        if (customBeepSoundInput) {
            customBeepSoundInput.value = settings.customBeepSoundKey || '';
        }
        mapRoomSizeInput.value = String(settings.mapRoomSize);
        mapRoomSizeValue.textContent = String(settings.mapRoomSize);
        mapLineWidthInput.value = String(settings.mapLineWidth);
        mapLineWidthValue.textContent = String(settings.mapLineWidth);
        mapPlayerMarkerStrokeColorInput.value = settings.mapPlayerMarkerStrokeColor;
        mapPlayerMarkerFillColorInput.value = settings.mapPlayerMarkerFillColor;
        mapPlayerMarkerStrokeAlphaInput.value = String(settings.mapPlayerMarkerStrokeAlpha);
        mapPlayerMarkerStrokeAlphaValue.textContent = String(settings.mapPlayerMarkerStrokeAlpha);
        mapPlayerMarkerFillAlphaInput.value = String(settings.mapPlayerMarkerFillAlpha);
        mapPlayerMarkerFillAlphaValue.textContent = String(settings.mapPlayerMarkerFillAlpha);
        mapPlayerMarkerStrokeWidthInput.value = String(settings.mapPlayerMarkerStrokeWidth);
        mapPlayerMarkerStrokeWidthValue.textContent = String(settings.mapPlayerMarkerStrokeWidth);
        mapPlayerMarkerSizeFactorInput.value = String(settings.mapPlayerMarkerSizeFactor);
        mapPlayerMarkerSizeFactorValue.textContent = String(settings.mapPlayerMarkerSizeFactor);
        mapPlayerMarkerDashEnabledInput.checked = settings.mapPlayerMarkerDashEnabled;
    };

    populateFormInputs(current);
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
    let fontGuessTimeout: ReturnType<typeof setTimeout> | undefined;
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

    // Helper function to get embedded map reference and refresh
    const refreshEmbeddedMap = () => {
        const embedded = (globalThis as any).embedded;
        embedded?.refreshRender();
    };

    mapRoomSizeInput.addEventListener('input', () => {
        mapRoomSizeValue.textContent = mapRoomSizeInput.value;
        Settings.roomSize = parseFloat(mapRoomSizeInput.value);
        refreshEmbeddedMap();
    });

    mapLineWidthInput.addEventListener('input', () => {
        mapLineWidthValue.textContent = mapLineWidthInput.value;
        Settings.lineWidth = parseFloat(mapLineWidthInput.value);
        refreshEmbeddedMap();
    });

    mapPlayerMarkerStrokeAlphaInput.addEventListener('input', () => {
        mapPlayerMarkerStrokeAlphaValue.textContent = mapPlayerMarkerStrokeAlphaInput.value;
        Settings.playerMarker.strokeAlpha = parseFloat(mapPlayerMarkerStrokeAlphaInput.value);
        refreshEmbeddedMap();
    });

    mapPlayerMarkerFillAlphaInput.addEventListener('input', () => {
        mapPlayerMarkerFillAlphaValue.textContent = mapPlayerMarkerFillAlphaInput.value;
        Settings.playerMarker.fillAlpha = parseFloat(mapPlayerMarkerFillAlphaInput.value);
        refreshEmbeddedMap();
    });

    mapPlayerMarkerStrokeWidthInput.addEventListener('input', () => {
        mapPlayerMarkerStrokeWidthValue.textContent = mapPlayerMarkerStrokeWidthInput.value;
        Settings.playerMarker.strokeWidth = parseFloat(mapPlayerMarkerStrokeWidthInput.value);
        refreshEmbeddedMap();
    });

    mapPlayerMarkerSizeFactorInput.addEventListener('input', () => {
        mapPlayerMarkerSizeFactorValue.textContent = mapPlayerMarkerSizeFactorInput.value;
        Settings.playerMarker.sizeFactor = parseFloat(mapPlayerMarkerSizeFactorInput.value);
        refreshEmbeddedMap();
    });

    mapPlayerMarkerDashEnabledInput.addEventListener('change', () => {
        Settings.playerMarker.dashEnabled = mapPlayerMarkerDashEnabledInput.checked;
        refreshEmbeddedMap();
    });

    if (customBeepSoundInput) {
        customBeepSoundInput.addEventListener('change', (e) => {
            const value = (e.target as HTMLSelectElement).value;
            if (value === '__upload__') {
                customBeepFileInput?.click();
                return;
            }
        });
    }

    if (customBeepFileInput) {
        customBeepFileInput.addEventListener('change', handleCustomBeepFileChange);
    }

    const handleStorageChange = async (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
        if (CUSTOM_SOUNDS_STORAGE_KEY in changes) {
            await loadCustomSounds();
            if (customBeepSoundInput) {
                customBeepSoundInput.value = current.customBeepSoundKey || '';
            }
        }
        const uiSettingsChange = changes.uiSettings;
        if (!uiSettingsChange || !uiSettingsChange.newValue) {
            return;
        }
        current = await load();
        populateFormInputs(current);
        updateLabelRenderModeState();
        updateCustomFontState();
    };

    storage.onChanged?.addListener(handleStorageChange);

    function refreshExplorationStats() {
        const map = (globalThis as any).embedded;
        if (map?.getVisitedCount && map?.getRoomCount && explorationStats) {
            const visited = map.getVisitedCount();
            const total = map.getRoomCount();
            explorationStats.textContent = `(${visited}/${total})`;
        }
    }

    function read(): UiSettings {
        const mapScale = (() => {
            const scale = normalizeMapScale(mapInput.value);
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
            showClockDisplay: showClockDisplayInput.checked,
            fontFamily: isUiFontSelection(fontFamilyInput.value) ? fontFamilyInput.value : defaultSettings.fontFamily,
            customFontUrl: (() => {
                const value = customFontUrlInput.value.trim();
                return /^https?:\/\//i.test(value) ? value : '';
            })(),
            customFontFamily: customFontFamilyInput.value.trim(),
            autoLowercaseCommands: autoLowercaseCommandsInput.checked,
            customBeepSoundKey: customBeepSoundInput?.value || undefined,
            mapRoomSize: parseFloat(mapRoomSizeInput.value) || defaultSettings.mapRoomSize,
            mapLineWidth: parseFloat(mapLineWidthInput.value) || defaultSettings.mapLineWidth,
            mapPlayerMarkerStrokeColor: mapPlayerMarkerStrokeColorInput.value || defaultSettings.mapPlayerMarkerStrokeColor,
            mapPlayerMarkerFillColor: mapPlayerMarkerFillColorInput.value || defaultSettings.mapPlayerMarkerFillColor,
            mapPlayerMarkerStrokeAlpha: parseFloat(mapPlayerMarkerStrokeAlphaInput.value) ?? defaultSettings.mapPlayerMarkerStrokeAlpha,
            mapPlayerMarkerFillAlpha: parseFloat(mapPlayerMarkerFillAlphaInput.value) ?? defaultSettings.mapPlayerMarkerFillAlpha,
            mapPlayerMarkerStrokeWidth: parseFloat(mapPlayerMarkerStrokeWidthInput.value) || defaultSettings.mapPlayerMarkerStrokeWidth,
            mapPlayerMarkerSizeFactor: parseFloat(mapPlayerMarkerSizeFactorInput.value) || defaultSettings.mapPlayerMarkerSizeFactor,
            mapPlayerMarkerDashEnabled: mapPlayerMarkerDashEnabledInput.checked,
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

    button.addEventListener('click', async () => {
        current = await load();
        populateFormInputs(current);
        updateLabelRenderModeState();
        updateCustomFontState();
        refreshExplorationStats();
        modal.show();
    });

    // Restore original settings when modal is closed without saving
    modalEl.addEventListener('hidden.bs.modal', () => {
        // Restore map rendering settings to their saved values
        Settings.roomSize = current.mapRoomSize;
        Settings.lineWidth = current.mapLineWidth;
        Settings.playerMarker.strokeAlpha = current.mapPlayerMarkerStrokeAlpha;
        Settings.playerMarker.fillAlpha = current.mapPlayerMarkerFillAlpha;
        Settings.playerMarker.strokeWidth = current.mapPlayerMarkerStrokeWidth;
        Settings.playerMarker.sizeFactor = current.mapPlayerMarkerSizeFactor;
        Settings.playerMarker.dashEnabled = current.mapPlayerMarkerDashEnabled;
        refreshEmbeddedMap();
    });

    // Initialize manage sounds modal
    const manageSoundsButton = document.getElementById('ui-manage-sounds-button');
    const manageSoundsModalEl = document.getElementById('manage-sounds-modal');

    if (manageSoundsButton && manageSoundsModalEl) {
        const manageSoundsModal = new Modal(manageSoundsModalEl);
        const manageSoundsList = document.getElementById('manage-sounds-list');
        const manageSoundsEmpty = document.getElementById('manage-sounds-empty');

        function renderSoundsList() {
            if (!manageSoundsList || !manageSoundsEmpty) return;

            manageSoundsList.innerHTML = '';

            if (customSoundsRef.current.length === 0) {
                manageSoundsList.style.display = 'none';
                manageSoundsEmpty.style.display = 'block';
                return;
            }

            manageSoundsList.style.display = 'flex';
            manageSoundsEmpty.style.display = 'none';

            customSoundsRef.current.forEach(sound => {
                const size = calculateBase64Size(sound.data);
                const item = document.createElement('div');
                item.className = 'd-flex align-items-center justify-content-between p-2 border rounded';
                item.innerHTML = `
                    <div class="d-flex flex-column">
                        <span class="fw-semibold">${sound.name}</span>
                        <span class="text-muted small">${formatBytes(size)}</span>
                    </div>
                    <button class="btn btn-danger btn-sm" data-sound-key="${sound.key}">Usuń</button>
                `;

                const deleteBtn = item.querySelector('button');
                deleteBtn?.addEventListener('click', async () => {
                    if (!confirm(`Czy na pewno chcesz usunąć dźwięk "${sound.name}"?`)) {
                        return;
                    }

                    const nextSounds = customSoundsRef.current.filter(s => s.key !== sound.key);
                    customSoundsRef.current = nextSounds;

                    try {
                        await saveCustomSounds(nextSounds);

                        // If deleted sound was selected as custom beep, reset to default
                        if (current.customBeepSoundKey === sound.key) {
                            current = { ...current, customBeepSoundKey: undefined };
                            if (customBeepSoundInput) {
                                customBeepSoundInput.value = '';
                            }
                        }

                        populateCustomBeepOptions();
                        renderSoundsList();
                    } catch (error) {
                        console.error('Failed to delete custom sound', error);
                        alert('Nie udało się usunąć dźwięku');
                    }
                });

                manageSoundsList.appendChild(item);
            });
        }

        manageSoundsButton.addEventListener('click', () => {
            renderSoundsList();
            manageSoundsModal.show();
        });
    }
}
