import Modal from "bootstrap/js/dist/modal";
import {ensureFontLoaded, isUiFontSelection, UiFontSelection} from "./fontLoader";
import eventBus from "@modules/core/eventBus";
import {createRoot, type Root} from "react-dom/client";
import {createElement} from "react";
import type { SoundCategory } from '@shared/events/clientEvents.ts';
import type { SoundCategories } from './defaultUiSettings';

import {CustomSound, getCustomSounds, saveCustomSounds} from "@modules/core/customSounds";
import {loadLayoutState, resetLayoutState, saveLayoutState} from "@web/layout";
import {
    defaultFooterComponents,
    defaultUiSettings,
    type ColorTheme,
    type FooterComponentConfig,
    type MapRoomShape,
    type PathFindingAlgorithm,
    type UiSettings
} from "./defaultUiSettings";
import {globalStorage} from "@modules/core/storage";
import {applyCustomTheme, computeAccentHex, generateRandomColor, removeCustomTheme} from "./themes/randomTheme";

// Re-export for backwards compatibility
export { defaultUiSettings, defaultFooterComponents, type UiSettings, type FooterComponentConfig, type MapRoomShape, type PathFindingAlgorithm, type ColorTheme } from "./defaultUiSettings";

const ALL_SOUND_CATEGORIES: SoundCategory[] = [
    'attack', 'hp', 'fishing', 'lamp', 'gear',
    'transport', 'spell', 'block', 'weapon', 'stun',
];

function hexAlphaToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

const MIN_MAP_SCALE = 0.01;

function clampMapScale(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_MAP_SCALE;
    }
    const normalized = Math.abs(value);
    return normalized >= MIN_MAP_SCALE ? normalized : MIN_MAP_SCALE;
}

function normalizeMapScale(value: unknown, fallback = defaultUiSettings.mapScale): number {
    const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return Math.max(fallback, MIN_MAP_SCALE);
    }
    return clampMapScale(numericValue);
}

function validateFooterComponents(parsed: unknown): FooterComponentConfig[] {
    if (!Array.isArray(parsed)) {
        return defaultFooterComponents.map(c => ({ ...c }));
    }
    const validIds = new Set(defaultFooterComponents.map(c => c.id));
    const seenIds = new Set<string>();
    const result: FooterComponentConfig[] = [];
    for (const item of parsed) {
        if (
            item &&
            typeof item === 'object' &&
            typeof (item as any).id === 'string' &&
            validIds.has((item as any).id) &&
            !seenIds.has((item as any).id)
        ) {
            const id = (item as any).id as string;
            seenIds.add(id);
            result.push({
                id,
                visible: typeof (item as any).visible === 'boolean' ? (item as any).visible : true,
                order: typeof (item as any).order === 'number' ? (item as any).order : result.length,
            });
        }
    }
    // Add any missing components from defaults
    for (const def of defaultFooterComponents) {
        if (!seenIds.has(def.id)) {
            result.push({ ...def, order: result.length });
        }
    }
    // Normalize order values
    return result.map((c, index) => ({ ...c, order: index }));
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

function applyFooterComponents(footerComponents: FooterComponentConfig[]) {
    const charState = document.getElementById('char-state');
    if (!charState) return;
    for (const config of footerComponents) {
        const element = charState.querySelector(`#${config.id}`) as HTMLElement | null;
        if (element) {
            element.style.order = String(config.order);
            element.dataset.footerHidden = config.visible ? '0' : '1';
        }
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
    // Apply color theme
    removeCustomTheme();
    if (document.body) {
        document.body.classList.remove('theme-fantasy', 'theme-forest', 'theme-icy', 'theme-gray', 'theme-dark-neutral', 'theme-light-parchment', 'theme-light-silver', 'theme-custom-dark');
        if (settings.colorTheme === 'custom-dark') {
            if (!settings.customThemeColor) {
                settings.customThemeColor = generateRandomColor();
                save(settings);
            }
            applyCustomTheme(settings.customThemeColor);
            document.body.classList.add('theme-custom-dark');
        } else if (settings.colorTheme && settings.colorTheme !== 'default') {
            document.body.classList.add(`theme-${settings.colorTheme}`);
        }
    }
    // Set CSS custom properties for font settings (used by chat popup and other components)
    if (document.body) {
        document.body.style.setProperty('--output-font-family', resolvedFontFamily || 'monospace');
        document.body.style.setProperty('--output-font-size', settings.contentFontSize + 'rem');
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
        document.body.style.setProperty('--output-bg', settings.outputBackground);
        content.style.paddingBottom = settings.outputBottomPadding > 0 ? settings.outputBottomPadding + 'px' : '';
    }
    const charState = document.getElementById('char-state');
    if (charState) {
        charState.style.fontSize = settings.contentFontSize + 'rem';
        charState.setAttribute('data-footer-mode', String(settings.footerMode));
    }
    const objectsList = document.getElementById('objects-list');
    if (objectsList) {
        objectsList.style.fontSize = settings.contentFontSize + 'rem';
    }
    applyFooterComponents(settings.footerComponents);
    const objects = document.getElementById('objects-list');
    if (objects) {
        if (resolvedFontFamily) {
            objects.style.fontFamily = resolvedFontFamily;
        } else {
            objects.style.removeProperty('font-family');
        }
        objects.style.fontSize = settings.objectsFontSize + 'rem';
        objects.style.backgroundColor = hexAlphaToRgba(settings.objectListBackgroundColor, settings.objectListBackgroundAlpha);
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
        if (settings.splitViewHeight && settings.splitViewHeight >= 60) {
            splitBottom.style.height = settings.splitViewHeight + 'px';
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
    if (content) {
        content.scrollTop = content.scrollHeight;
    }
    const embedded = (globalThis as any).embedded;
    if (embedded?.renderer) {
        embedded.setZoom?.(mapScale);
        embedded.setExplorationMode?.(settings.explorationMode);
        embedded.refresh();
    }
    const mapSettings = embedded?.settings;
    if (mapSettings) {
        mapSettings.transparentLabels = settings.transparentLabels;
        mapSettings.labelRenderMode = settings.transparentLabels ? 'data' : settings.labelRenderMode;
        mapSettings.instantMapMove = settings.instantMove;
        mapSettings.highlightCurrentRoom = settings.highlightCurrentRoom;
        mapSettings.roomSize = settings.mapRoomSize;
        mapSettings.lineWidth = settings.mapLineWidth;
        mapSettings.playerMarker.strokeColor = settings.mapPlayerMarkerStrokeColor;
        mapSettings.playerMarker.strokeAlpha = settings.mapPlayerMarkerStrokeAlpha;
        mapSettings.playerMarker.fillColor = settings.mapPlayerMarkerFillColor;
        mapSettings.playerMarker.fillAlpha = settings.mapPlayerMarkerFillAlpha;
        mapSettings.playerMarker.strokeWidth = settings.mapPlayerMarkerStrokeWidth;
        mapSettings.playerMarker.sizeFactor = settings.mapPlayerMarkerSizeFactor;
        mapSettings.playerMarker.dashEnabled = settings.mapPlayerMarkerDashEnabled;
        mapSettings.roomShape = settings.mapRoomShape;
        mapSettings.lineColor = settings.mapLineColor;
        const isLayoutManagerEnabled = loadLayoutState().enabled;
        mapSettings.backgroundColor = (settings.mapPosition.includes('overlay') && !isLayoutManagerEnabled)
            ? 'transparent'
            : settings.mapBackgroundColor;
        embedded.renderer?.updateBackground?.();
    }
    const pathFinder = embedded?.pathFinder;
    if (pathFinder?.setAlgorithm) {
        pathFinder.setAlgorithm(settings.pathFindingAlgorithm);
    }
    embedded?.setTransparentLabels?.(settings.transparentLabels);
    embedded?.setLabelRenderMode?.(settings.transparentLabels ? 'data' : settings.labelRenderMode);
    embedded?.setInstantMove?.(settings.instantMove);
    embedded?.setHighlightCurrentRoom?.(settings.highlightCurrentRoom);
    embedded?.refresh();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('map-position-change'));
    }
}

function load(): UiSettings {
    try {
        const raw = globalStorage.get('uiSettings');
        let parsed: any = {};
        if (raw) {
            parsed = raw as any;
        }
        if (raw || Object.keys(parsed).length > 0) {
            const mapScale = normalizeMapScale(parsed.mapScale);
            const mapPosition = mapPositions.includes(parsed.mapPosition as MapPosition)
                ? (parsed.mapPosition as MapPosition)
                : defaultUiSettings.mapPosition;
            const transparentLabels = typeof parsed.transparentLabels === 'boolean'
                ? parsed.transparentLabels
                : defaultUiSettings.transparentLabels;
            const labelRenderMode = parsed.labelRenderMode === 'image' || parsed.labelRenderMode === 'data' || parsed.labelRenderMode === 'none'
                ? parsed.labelRenderMode
                : defaultUiSettings.labelRenderMode;
            const effectiveLabelRenderMode = transparentLabels ? 'data' : labelRenderMode;
            const xtermPalette = parsed.xtermPalette === 'proper' ? 'proper' : defaultUiSettings.xtermPalette;
            const footerMode = typeof parsed.footerMode === 'number' ? parsed.footerMode : defaultUiSettings.footerMode;
            const explorationMode = !!parsed.explorationMode;
            const fightTitleIcon = typeof parsed.fightTitleIcon === 'boolean' ? parsed.fightTitleIcon : defaultUiSettings.fightTitleIcon;
            const hapticFeedback = typeof parsed.hapticFeedback === 'boolean' ? parsed.hapticFeedback : defaultUiSettings.hapticFeedback;
            const instantMove = typeof parsed.instantMove === 'boolean' ? parsed.instantMove : defaultUiSettings.instantMove;
            const highlightCurrentRoom = typeof parsed.highlightCurrentRoom === 'boolean'
                ? parsed.highlightCurrentRoom
                : defaultUiSettings.highlightCurrentRoom;
            const outputBackground = typeof parsed.outputBackground === 'string'
                && /^#[0-9a-f]{6}$/i.test(parsed.outputBackground.trim())
                    ? parsed.outputBackground.trim()
                    : defaultUiSettings.outputBackground;
            const objectListBackgroundColor = typeof parsed.objectListBackgroundColor === 'string'
                && /^#[0-9a-f]{6}$/i.test(parsed.objectListBackgroundColor.trim())
                    ? parsed.objectListBackgroundColor.trim()
                    : defaultUiSettings.objectListBackgroundColor;
            const objectListBackgroundAlpha = typeof parsed.objectListBackgroundAlpha === 'number'
                && parsed.objectListBackgroundAlpha >= 0 && parsed.objectListBackgroundAlpha <= 1
                    ? parsed.objectListBackgroundAlpha
                    : defaultUiSettings.objectListBackgroundAlpha;
            const fontFamily = isUiFontSelection(parsed.fontFamily)
                ? parsed.fontFamily
                : defaultUiSettings.fontFamily;
            const customFontUrl = typeof parsed.customFontUrl === 'string'
                ? parsed.customFontUrl.trim()
                : defaultUiSettings.customFontUrl;
            const normalizedCustomFontUrl = /^https?:\/\//i.test(customFontUrl)
                ? customFontUrl
                : defaultUiSettings.customFontUrl;
            const customFontFamily = typeof parsed.customFontFamily === 'string'
                ? parsed.customFontFamily.trim()
                : defaultUiSettings.customFontFamily;
            const clearInputOnSend = typeof parsed.clearInputOnSend === 'boolean'
                ? parsed.clearInputOnSend
                : defaultUiSettings.clearInputOnSend;
            const autoLowercaseCommands = typeof parsed.autoLowercaseCommands === 'boolean'
                ? parsed.autoLowercaseCommands
                : defaultUiSettings.autoLowercaseCommands;
            const customBeepSoundKey = typeof parsed.customBeepSoundKey === 'string'
                ? parsed.customBeepSoundKey || undefined
                : defaultUiSettings.customBeepSoundKey;
            const soundCategories: SoundCategories = {};
            if (parsed?.soundCategories && typeof parsed.soundCategories === 'object') {
                ALL_SOUND_CATEGORIES.forEach(cat => {
                    const val = (parsed.soundCategories as any)[cat];
                    if (val === null) {
                        soundCategories[cat] = null;
                    } else if (typeof val === 'string' && val) {
                        soundCategories[cat] = val;
                    }
                });
            }
            const mapRoomSize = typeof parsed.mapRoomSize === 'number' && parsed.mapRoomSize > 0
                ? parsed.mapRoomSize
                : defaultUiSettings.mapRoomSize;
            const mapLineWidth = typeof parsed.mapLineWidth === 'number' && parsed.mapLineWidth > 0
                ? parsed.mapLineWidth
                : defaultUiSettings.mapLineWidth;
            const mapPlayerMarkerStrokeColor = typeof parsed.mapPlayerMarkerStrokeColor === 'string'
                ? parsed.mapPlayerMarkerStrokeColor
                : defaultUiSettings.mapPlayerMarkerStrokeColor;
            const mapPlayerMarkerStrokeAlpha = typeof parsed.mapPlayerMarkerStrokeAlpha === 'number'
                ? parsed.mapPlayerMarkerStrokeAlpha
                : defaultUiSettings.mapPlayerMarkerStrokeAlpha;
            const mapPlayerMarkerFillColor = typeof parsed.mapPlayerMarkerFillColor === 'string'
                ? parsed.mapPlayerMarkerFillColor
                : defaultUiSettings.mapPlayerMarkerFillColor;
            const mapPlayerMarkerFillAlpha = typeof parsed.mapPlayerMarkerFillAlpha === 'number'
                ? parsed.mapPlayerMarkerFillAlpha
                : defaultUiSettings.mapPlayerMarkerFillAlpha;
            const mapPlayerMarkerStrokeWidth = typeof parsed.mapPlayerMarkerStrokeWidth === 'number'
                ? parsed.mapPlayerMarkerStrokeWidth
                : defaultUiSettings.mapPlayerMarkerStrokeWidth;
            const mapPlayerMarkerSizeFactor = typeof parsed.mapPlayerMarkerSizeFactor === 'number'
                ? parsed.mapPlayerMarkerSizeFactor
                : defaultUiSettings.mapPlayerMarkerSizeFactor;
            const mapPlayerMarkerDashEnabled = typeof parsed.mapPlayerMarkerDashEnabled === 'boolean'
                ? parsed.mapPlayerMarkerDashEnabled
                : defaultUiSettings.mapPlayerMarkerDashEnabled;
            const mapRoomShape = (parsed.mapRoomShape === 'rectangle' || parsed.mapRoomShape === 'circle' || parsed.mapRoomShape === 'roundedRectangle')
                ? parsed.mapRoomShape as MapRoomShape
                : defaultUiSettings.mapRoomShape;
            const pathFindingAlgorithm = (parsed.pathFindingAlgorithm === 'dijkstra' || parsed.pathFindingAlgorithm === 'astar')
                ? parsed.pathFindingAlgorithm as PathFindingAlgorithm
                : defaultUiSettings.pathFindingAlgorithm;
            const objectContextMenuCommands = Array.isArray(parsed.objectContextMenuCommands)
                ? parsed.objectContextMenuCommands.filter((c: unknown) => typeof c === 'string')
                : defaultUiSettings.objectContextMenuCommands;
            const footerComponents = validateFooterComponents(parsed.footerComponents);
            const keepMultibindsVisible = typeof parsed.keepMultibindsVisible === 'boolean'
                ? parsed.keepMultibindsVisible
                : defaultUiSettings.keepMultibindsVisible;
            const drinkableAsFunctionalBind = typeof parsed.drinkableAsFunctionalBind === 'boolean'
                ? parsed.drinkableAsFunctionalBind
                : defaultUiSettings.drinkableAsFunctionalBind;
            const wakeLock = typeof parsed.wakeLock === 'boolean'
                ? parsed.wakeLock
                : defaultUiSettings.wakeLock;
            const commandEcho = typeof parsed.commandEcho === 'boolean'
                ? parsed.commandEcho
                : defaultUiSettings.commandEcho;
            const outputBottomPadding = typeof parsed.outputBottomPadding === 'number' && parsed.outputBottomPadding >= 0
                ? parsed.outputBottomPadding
                : defaultUiSettings.outputBottomPadding;
            const outputMaxElements = typeof parsed.outputMaxElements === 'number' && parsed.outputMaxElements >= 100
                ? Math.floor(parsed.outputMaxElements)
                : defaultUiSettings.outputMaxElements;
            const colorTheme = (['default', 'fantasy', 'forest', 'icy', 'gray', 'dark-neutral', 'light-parchment', 'light-silver', 'custom-dark'].includes(parsed.colorTheme))
                ? parsed.colorTheme as ColorTheme
                : defaultUiSettings.colorTheme;
            const customThemeColor = (typeof parsed.customThemeColor === 'string' && /^#[0-9a-f]{6}$/i.test(parsed.customThemeColor))
                ? parsed.customThemeColor
                : undefined;
            const splitViewHeight = typeof parsed.splitViewHeight === 'number' && parsed.splitViewHeight >= 60
                ? parsed.splitViewHeight
                : undefined;
            return {
                ...defaultUiSettings,
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
                fontFamily,
                customFontUrl: normalizedCustomFontUrl,
                customFontFamily,
                autoLowercaseCommands,
                customBeepSoundKey,
                soundCategories,
                mapRoomSize,
                mapLineWidth,
                mapPlayerMarkerStrokeColor,
                mapPlayerMarkerStrokeAlpha,
                mapPlayerMarkerFillColor,
                mapPlayerMarkerFillAlpha,
                mapPlayerMarkerStrokeWidth,
                mapPlayerMarkerSizeFactor,
                mapPlayerMarkerDashEnabled,
                mapRoomShape,
                pathFindingAlgorithm,
                objectContextMenuCommands,
                footerComponents,
                keepMultibindsVisible,
                drinkableAsFunctionalBind,
                wakeLock,
                commandEcho,
                outputBottomPadding,
                outputMaxElements,
                splitViewHeight,
                objectListBackgroundColor,
                objectListBackgroundAlpha,
                colorTheme,
                customThemeColor,
            };
        }
    } catch {
        // ignore malformed data
    }
    return { ...defaultUiSettings };
}

function save(settings: UiSettings) {
    globalStorage.set('uiSettings', settings);
}

export default async function initUiSettings() {
    const button = document.getElementById('ui-settings-button') as HTMLButtonElement | null;
    const modalEl = document.getElementById('ui-settings-modal');
    if (!button || !modalEl) return;

    const modal = new Modal(modalEl);
    const contentInput = modalEl.querySelector('#ui-content-font') as HTMLInputElement;
    const objectsInput = modalEl.querySelector('#ui-objects-font') as HTMLInputElement;
    const mapInput = modalEl.querySelector('#ui-map-scale') as HTMLInputElement;
    const mapHeightInput = modalEl.querySelector('#ui-map-height') as HTMLInputElement;
    const mapPositionInput = modalEl.querySelector('#ui-map-position') as HTMLSelectElement;
    const explorationInput = modalEl.querySelector('#ui-exploration-mode') as HTMLInputElement;
    const explorationStats = modalEl.querySelector('#ui-exploration-stats') as HTMLElement | null;
    const showButtonsInput = modalEl.querySelector('#ui-show-buttons') as HTMLInputElement;
    const hapticFeedbackInput = modalEl.querySelector('#ui-haptic-feedback') as HTMLInputElement;
    const emojiLabelsInput = modalEl.querySelector('#ui-emoji-labels') as HTMLInputElement;
    let barOrderConfig: string[] = [];
    let alwaysVisibleBarsConfig: string[] = [];
    const fightTitleIconInput = modalEl.querySelector('#ui-fight-title-icon') as HTMLInputElement;
    const xtermPaletteInput = modalEl.querySelector('#ui-xterm-palette') as HTMLSelectElement;
    const colorThemeInput = modalEl.querySelector('#ui-color-theme') as HTMLSelectElement;
    const customThemeControls = modalEl.querySelector('#ui-random-theme-controls') as HTMLElement | null;
    const customThemeColorInput = modalEl.querySelector('#ui-random-theme-color') as HTMLInputElement | null;
    const randomizeThemeBtn = modalEl.querySelector('#ui-randomize-theme') as HTMLButtonElement | null;
    const footerModeInput = modalEl.querySelector('#ui-footer-mode') as HTMLSelectElement;
    const instantMoveInput = modalEl.querySelector('#ui-instant-move') as HTMLInputElement;
    const highlightCurrentRoomInput = modalEl.querySelector('#ui-highlight-current-room') as HTMLInputElement;
    const labelRenderModeInput = modalEl.querySelector('#ui-label-render-mode') as HTMLSelectElement;
    const transparentLabelsInput = modalEl.querySelector('#ui-transparent-labels') as HTMLInputElement;
    const outputBackgroundInput = modalEl.querySelector('#ui-output-background') as HTMLInputElement;
    const outputBackgroundReset = modalEl.querySelector('#ui-output-background-reset') as HTMLButtonElement | null;
    const objectListBgColorInput = modalEl.querySelector('#ui-objectlist-bg-color') as HTMLInputElement;
    const objectListBgAlphaInput = modalEl.querySelector('#ui-objectlist-bg-alpha') as HTMLInputElement;
    const objectListBgAlphaValue = modalEl.querySelector('#ui-objectlist-bg-alpha-value') as HTMLElement;
    const objectListBgResetBtn = modalEl.querySelector('#ui-objectlist-bg-reset') as HTMLButtonElement | null;
    const clearInputOnSendInput = modalEl.querySelector('#ui-clear-input') as HTMLInputElement;
    const fontFamilyInput = modalEl.querySelector('#ui-font-family') as HTMLSelectElement;
    const customFontSettings = modalEl.querySelector('#ui-custom-font-settings') as HTMLElement | null;
    const customFontUrlInput = modalEl.querySelector('#ui-custom-font-url') as HTMLInputElement;
    const customFontFamilyInput = modalEl.querySelector('#ui-custom-font-family') as HTMLInputElement;
    const autoLowercaseCommandsInput = modalEl.querySelector('#ui-auto-lowercase-commands') as HTMLInputElement;
    const keepMultibindsVisibleInput = modalEl.querySelector('#ui-keep-multibinds-visible') as HTMLInputElement;
    const drinkableAsFunctionalBindInput = modalEl.querySelector('#ui-drinkable-as-functional-bind') as HTMLInputElement;
    const wakeLockInput = modalEl.querySelector('#ui-wake-lock') as HTMLInputElement;
    const commandEchoInput = modalEl.querySelector('#ui-command-echo') as HTMLInputElement;
    const outputBottomPaddingInput = modalEl.querySelector('#ui-output-bottom-padding') as HTMLInputElement;
    const outputMaxElementsInput = modalEl.querySelector('#ui-output-max-elements') as HTMLInputElement;
    const customBeepSoundInput = modalEl.querySelector('#ui-custom-beep-sound') as HTMLSelectElement;
    const customBeepFileInput = modalEl.querySelector('#ui-custom-beep-file') as HTMLInputElement;
    const categoryFileInput = modalEl.querySelector('#ui-sound-category-file') as HTMLInputElement | null;
    const categorySelects: Partial<Record<SoundCategory, HTMLSelectElement>> = {};
    const categoryPlayButtons: Partial<Record<SoundCategory, HTMLButtonElement>> = {};
    ALL_SOUND_CATEGORIES.forEach(cat => {
        const el = modalEl.querySelector(`#ui-sound-category-${cat}`) as HTMLSelectElement | null;
        if (!el) return;
        categorySelects[cat] = el;
        const wrapper = document.createElement('div');
        wrapper.className = 'd-flex gap-1 align-items-center';
        el.parentNode?.insertBefore(wrapper, el);
        wrapper.appendChild(el);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-outline-secondary flex-shrink-0';
        btn.textContent = '▶';
        wrapper.appendChild(btn);
        categoryPlayButtons[cat] = btn;
    });
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
    const mapBackgroundColorInput = modalEl.querySelector('#ui-map-background-color') as HTMLInputElement;
    const mapBackgroundColorResetBtn = modalEl.querySelector('#ui-map-background-color-reset') as HTMLButtonElement | null;
    const mapLineColorInput = modalEl.querySelector('#ui-map-line-color') as HTMLInputElement;
    const mapLineColorResetBtn = modalEl.querySelector('#ui-map-line-color-reset') as HTMLButtonElement | null;
    const mapRoomShapeInput = modalEl.querySelector('#ui-map-room-shape') as HTMLSelectElement;
    const pathFindingAlgorithmInput = modalEl.querySelector('#ui-map-pathfinding-algorithm') as HTMLSelectElement;
    const mapPreviewCanvas = modalEl.querySelector('#ui-map-preview-canvas') as HTMLCanvasElement;
    const teamNumberingModeInput = modalEl.querySelector('#ui-team-numbering-mode') as HTMLSelectElement;
    const objectContextMenuContainer = modalEl.querySelector('#ui-object-context-menu-container') as HTMLDivElement;
    const objectContextMenuInput = modalEl.querySelector('#ui-object-context-menu-input') as HTMLInputElement;
    const saveBtn = modalEl.querySelector('#ui-settings-save') as HTMLButtonElement;

    let current = load();
    let customSounds: CustomSound[] = [];
    const customSoundsRef = { current: customSounds };
    let objectContextMenuCommands: string[] = [...current.objectContextMenuCommands];
    let footerComponentsConfig: FooterComponentConfig[] = [...current.footerComponents];

    // Create wrapper and close button for input to look like a badge when typing
    let inputWrapper: HTMLSpanElement | null = null;
    let inputCloseBtn: HTMLSpanElement | null = null;

    if (objectContextMenuInput && objectContextMenuContainer) {
        inputWrapper = document.createElement('span');
        inputWrapper.className = 'context-menu-input-wrapper';
        inputCloseBtn = document.createElement('span');
        inputCloseBtn.textContent = '\u00d7';
        inputCloseBtn.style.cssText = 'cursor: pointer; margin-left: 0.25rem; line-height: 1; opacity: 0.7; display: none;';

        // Wrap the input
        objectContextMenuContainer.insertBefore(inputWrapper, objectContextMenuInput);
        inputWrapper.appendChild(objectContextMenuInput);
        inputWrapper.appendChild(inputCloseBtn);
    }

    const renderObjectContextMenuCommands = () => {
        if (!objectContextMenuContainer) return;
        // Remove existing badges (keep input wrapper)
        objectContextMenuContainer.querySelectorAll('.context-menu-badge').forEach(el => el.remove());
        // Insert badges before input wrapper (or at end if no wrapper)
        const insertBeforeEl = inputWrapper || null;
        objectContextMenuCommands.forEach(cmd => {
            const badge = document.createElement('span');
            badge.className = 'badge bg-secondary d-inline-flex align-items-center context-menu-badge';
            badge.style.cssText = 'font-size: 0.7rem; padding: 0.15rem 0.35rem; font-weight: normal; line-height: 1; box-sizing: border-box; cursor: pointer;';
            // Wrap text in span for proper flex alignment
            const textSpan = document.createElement('span');
            textSpan.textContent = cmd;
            textSpan.style.cssText = 'line-height: 1;';
            badge.appendChild(textSpan);
            const closeBtn = document.createElement('span');
            closeBtn.textContent = '\u00d7';
            closeBtn.style.cssText = 'margin-left: 0.25rem; line-height: 1; opacity: 0.7;';
            badge.appendChild(closeBtn);
            // Click anywhere on badge to remove
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                objectContextMenuCommands = objectContextMenuCommands.filter(c => c !== cmd);
                renderObjectContextMenuCommands();
            });
            badge.addEventListener('mouseenter', () => { closeBtn.style.opacity = '1'; });
            badge.addEventListener('mouseleave', () => { closeBtn.style.opacity = '0.7'; });
            objectContextMenuContainer.insertBefore(badge, insertBeforeEl);
        });
    };

    // Flag to prevent blur from committing when X button is clicked
    let cancellingInput = false;

    if (objectContextMenuInput && objectContextMenuContainer && inputCloseBtn) {
        objectContextMenuContainer.addEventListener('click', () => {
            objectContextMenuInput?.focus();
        });

        // Use mousedown to set flag before blur fires
        inputCloseBtn.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent blur
            e.stopPropagation();
            cancellingInput = true;
            if (objectContextMenuInput) {
                objectContextMenuInput.value = '';
                resizeInput();
                objectContextMenuInput.focus();
            }
            cancellingInput = false;
        });
        inputCloseBtn.addEventListener('mouseenter', () => { if (inputCloseBtn) inputCloseBtn.style.opacity = '1'; });
        inputCloseBtn.addEventListener('mouseleave', () => { if (inputCloseBtn) inputCloseBtn.style.opacity = '0.7'; });
    }

    const resizeInput = () => {
        if (!objectContextMenuInput || !inputWrapper || !inputCloseBtn) return;
        const len = objectContextMenuInput.value.length;
        if (len > 0) {
            // Style wrapper as badge (exact same as badges)
            inputWrapper.className = 'badge bg-secondary d-inline-flex align-items-center context-menu-input-wrapper';
            inputWrapper.style.cssText = 'font-size: 0.7rem; padding: 0.15rem 0.35rem; font-weight: normal; line-height: 1; box-sizing: border-box;';
            // Input minimal styling inside badge - no extra margin/padding
            objectContextMenuInput.style.cssText = 'outline: none; width: ' + len + 'ch; max-width: ' + len + 'ch; background: transparent; color: white; border: none; padding: 0; margin: 0; font-size: inherit; font-weight: inherit; line-height: inherit; box-sizing: border-box;';
            inputCloseBtn.style.display = 'inline';
        } else {
            // Wrapper unstyled but same height as badges (add vertical padding to match badge height)
            inputWrapper.className = 'context-menu-input-wrapper d-inline-flex align-items-center';
            inputWrapper.style.cssText = 'font-size: 0.7rem; line-height: 1; padding: 0.15rem 0; box-sizing: border-box;';
            // Input minimal - same font-size and line-height as badges to match height
            objectContextMenuInput.style.cssText = 'outline: none; width: 1ch; min-width: 1ch; background: transparent; font-size: inherit; padding: 0; margin: 0; border: none; line-height: inherit;';
            inputCloseBtn.style.display = 'none';
        }
    };

    const commitInput = () => {
        if (!objectContextMenuInput) return false;
        const val = objectContextMenuInput.value.trim();
        if (val && !objectContextMenuCommands.includes(val)) {
            objectContextMenuCommands.push(val);
            objectContextMenuInput.value = '';
            renderObjectContextMenuCommands();
            resizeInput();
            return true;
        }
        return false;
    };

    const flashDuplicateBadge = (cmd: string) => {
        if (!objectContextMenuContainer) return;
        const badges = objectContextMenuContainer.querySelectorAll('.context-menu-badge');
        for (const badge of badges) {
            const textSpan = badge.querySelector('span');
            if (textSpan && textSpan.textContent === cmd) {
                badge.classList.add('duplicate-flash');
                setTimeout(() => badge.classList.remove('duplicate-flash'), 300);
                break;
            }
        }
    };

    if (objectContextMenuInput) {
        objectContextMenuInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const val = objectContextMenuInput.value.trim();
                if (val && !objectContextMenuCommands.includes(val)) {
                    objectContextMenuCommands.push(val);
                    objectContextMenuInput.value = '';
                    renderObjectContextMenuCommands();
                    resizeInput();
                } else if (val) {
                    // Value exists - flash the existing badge and clear input
                    flashDuplicateBadge(val);
                    objectContextMenuInput.value = '';
                    resizeInput();
                }
            } else if (e.key === 'Backspace' && objectContextMenuInput.value === '' && objectContextMenuCommands.length > 0) {
                objectContextMenuCommands.pop();
                renderObjectContextMenuCommands();
            }
        });
        objectContextMenuInput.addEventListener('input', resizeInput);
        objectContextMenuInput.addEventListener('blur', () => {
            if (!cancellingInput) {
                commitInput();
            }
        });
    }

    renderObjectContextMenuCommands();
    resizeInput(); // Initialize input wrapper state

    const loadCustomSounds = async () => {
        try {
            customSounds = await getCustomSounds();
            customSoundsRef.current = customSounds;
            populateCustomBeepOptions();
            populateCategoryOptions();
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

    const populateCategoryOptions = () => {
        ALL_SOUND_CATEGORIES.forEach(cat => {
            const select = categorySelects[cat];
            if (!select) return;
            const currentValue = select.value;
            // Remove existing custom sound options (keep first two: default + disabled)
            while (select.options.length > 2) {
                select.remove(2);
            }
            customSounds.forEach(sound => {
                const option = document.createElement('option');
                option.value = sound.key;
                option.textContent = sound.name;
                select.appendChild(option);
            });
            const uploadOption = document.createElement('option');
            uploadOption.value = '__upload__';
            uploadOption.textContent = 'Dodaj dźwięk…';
            select.appendChild(uploadOption);
            if (currentValue) {
                select.value = currentValue;
            }
        });
    };

    const previewCategorySound = async (key: string) => {
        try {
            const { Howl } = await import('howler');
            let soundData: string | undefined;
            if (key === 'beep') {
                const { beepSound } = await import('../client/sounds');
                soundData = beepSound;
            } else {
                soundData = customSoundsRef.current.find(s => s.key === key)?.data;
            }
            if (!soundData) return;
            const howl = new Howl({ src: [soundData], preload: true });
            howl.once('load', () => howl.play());
            howl.load();
        } catch (error) {
            console.error('Failed to preview sound', error);
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
                    populateCategoryOptions();
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

    let pendingUploadCategory: SoundCategory | null = null;

    const handleCategoryFileChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0] ?? null;
        target.value = '';
        const cat = pendingUploadCategory;
        pendingUploadCategory = null;
        if (!cat) return;
        const select = categorySelects[cat];
        if (!file) {
            if (select) select.value = (current.soundCategories?.[cat] === null ? '__disabled__' : current.soundCategories?.[cat] || '');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                if (select) select.value = (current.soundCategories?.[cat] === null ? '__disabled__' : current.soundCategories?.[cat] || '');
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
                    populateCustomBeepOptions();
                    populateCategoryOptions();
                    if (select) select.value = sound.key;
                    current = { ...current, soundCategories: { ...current.soundCategories, [cat]: sound.key } };
                })
                .catch(() => {
                    if (select) select.value = (current.soundCategories?.[cat] === null ? '__disabled__' : current.soundCategories?.[cat] || '');
                });
        };
        reader.onerror = () => {
            if (select) select.value = (current.soundCategories?.[cat] === null ? '__disabled__' : current.soundCategories?.[cat] || '');
        };
        reader.readAsDataURL(file);
    };

    await loadCustomSounds();

    const populateFormInputs = (settings: UiSettings) => {
        contentInput.value = String(settings.contentFontSize);
        objectsInput.value = String(settings.objectsFontSize);
        mapInput.value = String(settings.mapScale);
        mapHeightInput.value = String(settings.mapHeight);
        mapPositionInput.value = settings.mapPosition;
        explorationInput.checked = settings.explorationMode;
        showButtonsInput.checked = settings.showButtons;
        hapticFeedbackInput.checked = settings.hapticFeedback;
        emojiLabelsInput.checked = settings.emojiLabels;
        fightTitleIconInput.checked = settings.fightTitleIcon;
        xtermPaletteInput.value = settings.xtermPalette;
        if (colorThemeInput) colorThemeInput.value = settings.colorTheme || 'default';
        footerModeInput.value = String(settings.footerMode);
        instantMoveInput.checked = settings.instantMove;
        highlightCurrentRoomInput.checked = settings.highlightCurrentRoom;
        labelRenderModeInput.value = settings.labelRenderMode;
        transparentLabelsInput.checked = settings.transparentLabels;
        outputBackgroundInput.value = settings.outputBackground;
        objectListBgColorInput.value = settings.objectListBackgroundColor;
        objectListBgAlphaInput.value = String(settings.objectListBackgroundAlpha);
        objectListBgAlphaValue.textContent = String(settings.objectListBackgroundAlpha);
        clearInputOnSendInput.checked = settings.clearInputOnSend;
        fontFamilyInput.value = settings.fontFamily;
        customFontUrlInput.value = settings.customFontUrl;
        customFontFamilyInput.value = settings.customFontFamily;
        autoLowercaseCommandsInput.checked = settings.autoLowercaseCommands;
        keepMultibindsVisibleInput.checked = settings.keepMultibindsVisible;
        drinkableAsFunctionalBindInput.checked = settings.drinkableAsFunctionalBind;
        wakeLockInput.checked = settings.wakeLock;
        commandEchoInput.checked = settings.commandEcho;
        outputBottomPaddingInput.value = String(settings.outputBottomPadding);
        outputMaxElementsInput.value = String(settings.outputMaxElements);
        if (customBeepSoundInput) {
            customBeepSoundInput.value = settings.customBeepSoundKey || '';
        }
        ALL_SOUND_CATEGORIES.forEach(cat => {
            const select = categorySelects[cat];
            if (!select) return;
            const catValue = settings.soundCategories?.[cat];
            if (catValue === null) {
                select.value = '__disabled__';
            } else if (typeof catValue === 'string' && catValue) {
                select.value = catValue;
            } else {
                select.value = '';
            }
        });
        mapRoomSizeInput.value = String(settings.mapRoomSize);
        mapRoomSizeValue.textContent = String(settings.mapRoomSize);
        mapLineWidthInput.value = String(settings.mapLineWidth);
        mapLineWidthValue.textContent = String(settings.mapLineWidth);
        mapBackgroundColorInput.value = settings.mapBackgroundColor;
        mapLineColorInput.value = settings.mapLineColor;
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
        mapRoomShapeInput.value = settings.mapRoomShape;
        pathFindingAlgorithmInput.value = settings.pathFindingAlgorithm;
        if (teamNumberingModeInput) teamNumberingModeInput.value = settings.teamNumberingMode;
        objectContextMenuCommands = [...settings.objectContextMenuCommands];
        renderObjectContextMenuCommands();
        footerComponentsConfig = [...settings.footerComponents];
        renderFooterComponentSettings();
        barOrderConfig = [...(settings.barOrder || defaultUiSettings.barOrder)];
        alwaysVisibleBarsConfig = [...(settings.alwaysVisibleBars || [])];
        renderBarOrderSettings();
    };

    // Will be defined later after the components are set up
    let renderFooterComponentSettings = () => {};
    let renderBarOrderSettings = () => {};

    populateFormInputs(current);

    const applyCustomDarkFromColor = (color: string) => {
        current = {
            ...current,
            colorTheme: 'custom-dark',
            customThemeColor: color,
        };
        save(current);
        removeCustomTheme();
        applyCustomTheme(color);
        document.body.classList.remove('theme-fantasy', 'theme-forest', 'theme-icy', 'theme-gray', 'theme-dark-neutral', 'theme-light-parchment', 'theme-light-silver');
        if (!document.body.classList.contains('theme-custom-dark')) {
            document.body.classList.add('theme-custom-dark');
        }
        if (colorThemeInput) colorThemeInput.value = 'custom-dark';
    };

    const updateCustomThemeControls = () => {
        const isCustom = colorThemeInput?.value === 'custom-dark';
        if (customThemeControls) {
            customThemeControls.classList.toggle('d-none', !isCustom);
            customThemeControls.classList.toggle('d-flex', isCustom);
        }
        if (isCustom && customThemeColorInput && current.customThemeColor) {
            customThemeColorInput.value = computeAccentHex(current.customThemeColor);
        }
    };
    updateCustomThemeControls();
    colorThemeInput?.addEventListener('change', updateCustomThemeControls);

    if (customThemeColorInput) {
        customThemeColorInput.addEventListener('change', () => {
            applyCustomDarkFromColor(customThemeColorInput.value);
            customThemeColorInput.value = computeAccentHex(customThemeColorInput.value);
        });
    }
    if (randomizeThemeBtn) {
        randomizeThemeBtn.addEventListener('click', () => {
            const color = generateRandomColor();
            if (customThemeColorInput) customThemeColorInput.value = computeAccentHex(color);
            applyCustomDarkFromColor(color);
        });
    }

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
        outputBackgroundInput.value = defaultUiSettings.outputBackground;
    });
    objectListBgResetBtn?.addEventListener('click', () => {
        objectListBgColorInput.value = defaultUiSettings.objectListBackgroundColor;
        objectListBgAlphaInput.value = String(defaultUiSettings.objectListBackgroundAlpha);
        objectListBgAlphaValue.textContent = String(defaultUiSettings.objectListBackgroundAlpha);
    });
    objectListBgAlphaInput?.addEventListener('input', () => {
        objectListBgAlphaValue.textContent = objectListBgAlphaInput.value;
    });
    apply(current);

    // Mount Footer Component Settings React component
    const footerComponentsContainer = modalEl.querySelector('#ui-footer-components-settings') as HTMLElement | null;
    let footerComponentsRoot: Root | null = null;
    renderFooterComponentSettings = () => {
        if (!footerComponentsContainer) return;
        import("./options/FooterComponentSettings").then(({ default: FooterComponentSettings }) => {
            if (!footerComponentsRoot) {
                footerComponentsRoot = createRoot(footerComponentsContainer);
            }
            footerComponentsRoot.render(createElement(FooterComponentSettings, {
                components: footerComponentsConfig,
                onChange: (updated: FooterComponentConfig[]) => {
                    footerComponentsConfig = updated;
                },
            }));
        });
    };
    renderFooterComponentSettings();

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

    // Function to draw preview of room and player marker
    const drawPreview = () => {
        if (!mapPreviewCanvas) return;
        const ctx = mapPreviewCanvas.getContext('2d');
        if (!ctx) return;

        const width = mapPreviewCanvas.width;
        const height = mapPreviewCanvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Get current values
        const roomSize = parseFloat(mapRoomSizeInput.value);
        const lineWidth = parseFloat(mapLineWidthInput.value);
        const roomShape = mapRoomShapeInput.value as MapRoomShape;
        const strokeColor = mapPlayerMarkerStrokeColorInput.value;
        const fillColor = mapPlayerMarkerFillColorInput.value;
        const strokeAlpha = parseFloat(mapPlayerMarkerStrokeAlphaInput.value);
        const fillAlpha = parseFloat(mapPlayerMarkerFillAlphaInput.value);
        const strokeWidth = parseFloat(mapPlayerMarkerStrokeWidthInput.value);
        const sizeFactor = parseFloat(mapPlayerMarkerSizeFactorInput.value);
        const dashEnabled = mapPlayerMarkerDashEnabledInput.checked;

        // Scale for rendering (base size in pixels)
        const baseSize = 40;
        const scaledRoomSize = baseSize * roomSize;
        const scaledLineWidth = baseSize * lineWidth;
        const centerX = width / 2;
        const centerY = height / 2;

        // Draw sample room based on shape
        ctx.strokeStyle = '#888';
        ctx.lineWidth = scaledLineWidth;

        if (roomShape === 'circle') {
            ctx.beginPath();
            ctx.arc(centerX, centerY, scaledRoomSize / 2, 0, Math.PI * 2);
            ctx.stroke();
        } else if (roomShape === 'roundedRectangle') {
            const radius = scaledRoomSize * 0.2; // 20% corner radius
            const x = centerX - scaledRoomSize / 2;
            const y = centerY - scaledRoomSize / 2;
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + scaledRoomSize - radius, y);
            ctx.quadraticCurveTo(x + scaledRoomSize, y, x + scaledRoomSize, y + radius);
            ctx.lineTo(x + scaledRoomSize, y + scaledRoomSize - radius);
            ctx.quadraticCurveTo(x + scaledRoomSize, y + scaledRoomSize, x + scaledRoomSize - radius, y + scaledRoomSize);
            ctx.lineTo(x + radius, y + scaledRoomSize);
            ctx.quadraticCurveTo(x, y + scaledRoomSize, x, y + scaledRoomSize - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.stroke();
        } else {
            // rectangle (default)
            ctx.strokeRect(
                centerX - scaledRoomSize / 2,
                centerY - scaledRoomSize / 2,
                scaledRoomSize,
                scaledRoomSize
            );
        }

        // Draw player marker (circle)
        const markerRadius = (scaledRoomSize / 2) * sizeFactor;

        ctx.beginPath();
        ctx.arc(centerX, centerY, markerRadius, 0, Math.PI * 2);

        // Fill
        if (fillAlpha > 0) {
            ctx.fillStyle = fillColor + Math.round(fillAlpha * 255).toString(16).padStart(2, '0');
            ctx.fill();
        }

        // Stroke
        if (strokeAlpha > 0) {
            ctx.strokeStyle = strokeColor + Math.round(strokeAlpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = scaledRoomSize * strokeWidth;

            if (dashEnabled) {
                // Match the actual renderer's dash pattern [0.05, 0.05] in map units
                // scaledRoomSize represents 1.0 map unit (the room size)
                const dashLength = scaledRoomSize * 0.05;
                ctx.setLineDash([dashLength, dashLength]);
            } else {
                ctx.setLineDash([]);
            }

            ctx.stroke();
        }

        // Reset line dash
        ctx.setLineDash([]);
    };

    const getMapSettings = () => (globalThis as any).embedded?.settings;

    mapRoomSizeInput.addEventListener('input', () => {
        mapRoomSizeValue.textContent = mapRoomSizeInput.value;
        const s = getMapSettings();
        if (s) s.roomSize = parseFloat(mapRoomSizeInput.value);
        refreshEmbeddedMap();
        drawPreview();
    });

    mapLineWidthInput.addEventListener('input', () => {
        mapLineWidthValue.textContent = mapLineWidthInput.value;
        const s = getMapSettings();
        if (s) s.lineWidth = parseFloat(mapLineWidthInput.value);
        refreshEmbeddedMap();
        drawPreview();
    });

    mapBackgroundColorInput.addEventListener('input', () => {
        const s = getMapSettings();
        if (s) {
            const isOverlayWithoutLayout = mapPositionInput.value.includes('overlay') && !loadLayoutState().enabled;
            s.backgroundColor = isOverlayWithoutLayout ? 'transparent' : mapBackgroundColorInput.value;
            (globalThis as any).embedded?.renderer?.updateBackground?.();
        }
        refreshEmbeddedMap();
    });

    mapBackgroundColorResetBtn?.addEventListener('click', () => {
        mapBackgroundColorInput.value = defaultUiSettings.mapBackgroundColor;
        const s = getMapSettings();
        if (s) {
            const isOverlayWithoutLayout = mapPositionInput.value.includes('overlay') && !loadLayoutState().enabled;
            s.backgroundColor = isOverlayWithoutLayout ? 'transparent' : defaultUiSettings.mapBackgroundColor;
            (globalThis as any).embedded?.renderer?.updateBackground?.();
        }
        refreshEmbeddedMap();
    });

    mapLineColorInput.addEventListener('input', () => {
        const s = getMapSettings();
        if (s) s.lineColor = mapLineColorInput.value;
        refreshEmbeddedMap();
    });

    mapLineColorResetBtn?.addEventListener('click', () => {
        mapLineColorInput.value = defaultUiSettings.mapLineColor;
        const s = getMapSettings();
        if (s) s.lineColor = defaultUiSettings.mapLineColor;
        refreshEmbeddedMap();
    });

    mapPlayerMarkerStrokeAlphaInput.addEventListener('input', () => {
        mapPlayerMarkerStrokeAlphaValue.textContent = mapPlayerMarkerStrokeAlphaInput.value;
        const s = getMapSettings();
        if (s) s.playerMarker.strokeAlpha = parseFloat(mapPlayerMarkerStrokeAlphaInput.value);
        drawPreview();
    });

    mapPlayerMarkerFillAlphaInput.addEventListener('input', () => {
        mapPlayerMarkerFillAlphaValue.textContent = mapPlayerMarkerFillAlphaInput.value;
        const s = getMapSettings();
        if (s) s.playerMarker.fillAlpha = parseFloat(mapPlayerMarkerFillAlphaInput.value);
        drawPreview();
    });

    mapPlayerMarkerStrokeWidthInput.addEventListener('input', () => {
        mapPlayerMarkerStrokeWidthValue.textContent = mapPlayerMarkerStrokeWidthInput.value;
        const s = getMapSettings();
        if (s) s.playerMarker.strokeWidth = parseFloat(mapPlayerMarkerStrokeWidthInput.value);
        drawPreview();
    });

    mapPlayerMarkerSizeFactorInput.addEventListener('input', () => {
        mapPlayerMarkerSizeFactorValue.textContent = mapPlayerMarkerSizeFactorInput.value;
        const s = getMapSettings();
        if (s) s.playerMarker.sizeFactor = parseFloat(mapPlayerMarkerSizeFactorInput.value);
        drawPreview();
    });

    mapPlayerMarkerDashEnabledInput.addEventListener('change', () => {
        const s = getMapSettings();
        if (s) s.playerMarker.dashEnabled = mapPlayerMarkerDashEnabledInput.checked;
        drawPreview();
    });

    mapRoomShapeInput.addEventListener('change', () => {
        const s = getMapSettings();
        if (s) s.roomShape = mapRoomShapeInput.value as MapRoomShape;
        refreshEmbeddedMap();
        drawPreview();
    });

    pathFindingAlgorithmInput.addEventListener('change', () => {
        const embedded = (globalThis as any).embedded;
        const pathFinder = embedded?.pathFinder;
        if (pathFinder?.setAlgorithm) {
            pathFinder.setAlgorithm(pathFindingAlgorithmInput.value as PathFindingAlgorithm);
        }
    });

    mapPlayerMarkerStrokeColorInput.addEventListener('input', () => {
        drawPreview();
    });

    mapPlayerMarkerFillColorInput.addEventListener('input', () => {
        drawPreview();
    });

    // Initial preview draw
    drawPreview();

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

    ALL_SOUND_CATEGORIES.forEach(cat => {
        const select = categorySelects[cat];
        if (!select) return;
        select.addEventListener('change', () => {
            if (select.value === '__upload__') {
                pendingUploadCategory = cat;
                categoryFileInput?.click();
            }
        });
    });

    if (categoryFileInput) {
        categoryFileInput.addEventListener('change', handleCategoryFileChange);
    }

    ALL_SOUND_CATEGORIES.forEach(cat => {
        const btn = categoryPlayButtons[cat];
        const select = categorySelects[cat];
        if (!btn || !select) return;
        btn.addEventListener('click', () => {
            const soundKey = select.value || 'beep';
            if (soundKey === '__disabled__' || soundKey === '__upload__') return;
            void previewCategorySound(soundKey);
        });
    });

    // Mount Bar Order Settings React component
    const barOrderContainer = modalEl.querySelector('#ui-bar-order-settings') as HTMLElement | null;
    let barOrderRoot: Root | null = null;
    renderBarOrderSettings = () => {
        if (!barOrderContainer) return;
        import("./options/BarOrderSettings").then(({ default: BarOrderSettings }) => {
            if (!barOrderRoot) {
                barOrderRoot = createRoot(barOrderContainer);
            }
            barOrderRoot.render(createElement(BarOrderSettings, {
                barOrder: barOrderConfig,
                alwaysVisibleBars: alwaysVisibleBarsConfig,
                onChange: (newOrder: string[], newAlwaysVisible: string[]) => {
                    barOrderConfig = newOrder;
                    alwaysVisibleBarsConfig = newAlwaysVisible;
                },
            }));
        });
    };
    renderBarOrderSettings();

    globalStorage.onChange('uiSettings', (newValue) => {
        if (newValue) {
            current = load();
            populateFormInputs(current);
            updateLabelRenderModeState();
            updateCustomFontState();
            updateCustomThemeControls();
        }
    });
    globalStorage.onChange('custom_sounds', async () => {
        await loadCustomSounds();
        if (customBeepSoundInput) {
            customBeepSoundInput.value = current.customBeepSoundKey || '';
        }
        ALL_SOUND_CATEGORIES.forEach(cat => {
            const select = categorySelects[cat];
            if (!select) return;
            const catValue = current.soundCategories?.[cat];
            select.value = catValue === null ? '__disabled__' : catValue || '';
        });
    });

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
            : defaultUiSettings.outputBackground;

        return {
            contentFontSize: parseFloat(contentInput.value) || defaultUiSettings.contentFontSize,
            objectsFontSize: parseFloat(objectsInput.value) || defaultUiSettings.objectsFontSize,
            mapScale,
            mapHeight: parseFloat(mapHeightInput.value) || defaultUiSettings.mapHeight,
            mapPosition: (mapPositionInput.value as MapPosition) || defaultUiSettings.mapPosition,
            showButtons: showButtonsInput.checked,
            hapticFeedback: hapticFeedbackInput.checked,
            emojiLabels: emojiLabelsInput.checked,
            fightTitleIcon: fightTitleIconInput.checked,
            xtermPalette: (xtermPaletteInput.value as 'arkadia' | 'proper') || defaultUiSettings.xtermPalette,
            colorTheme: (['default', 'fantasy', 'forest', 'icy', 'gray', 'dark-neutral', 'light-parchment', 'light-silver', 'custom-dark'].includes(colorThemeInput?.value) ? colorThemeInput.value : defaultUiSettings.colorTheme) as ColorTheme,
            customThemeColor: current.customThemeColor,
            footerMode: parseInt(footerModeInput.value) || defaultUiSettings.footerMode,
            explorationMode: explorationInput.checked,
            instantMove: instantMoveInput.checked,
            highlightCurrentRoom: highlightCurrentRoomInput.checked,
            labelRenderMode: (['data', 'image', 'none'].includes(labelRenderModeInput.value) ? labelRenderModeInput.value : 'data') as 'data' | 'image' | 'none',
            transparentLabels: transparentLabelsInput.checked,
            outputBackground: backgroundValue,
            clearInputOnSend: clearInputOnSendInput.checked,
            fontFamily: isUiFontSelection(fontFamilyInput.value) ? fontFamilyInput.value : defaultUiSettings.fontFamily,
            customFontUrl: (() => {
                const value = customFontUrlInput.value.trim();
                return /^https?:\/\//i.test(value) ? value : '';
            })(),
            customFontFamily: customFontFamilyInput.value.trim(),
            autoLowercaseCommands: autoLowercaseCommandsInput.checked,
            keepMultibindsVisible: keepMultibindsVisibleInput.checked,
            drinkableAsFunctionalBind: drinkableAsFunctionalBindInput.checked,
            wakeLock: wakeLockInput.checked,
            customBeepSoundKey: customBeepSoundInput?.value || undefined,
            soundCategories: (() => {
                const result: SoundCategories = {};
                ALL_SOUND_CATEGORIES.forEach(cat => {
                    const select = categorySelects[cat];
                    if (!select) return;
                    const value = select.value;
                    if (value === '__disabled__') {
                        result[cat] = null;
                    } else if (value && value !== '') {
                        result[cat] = value;
                    }
                    // empty string = omit = default beep
                });
                return result;
            })(),
            mapRoomSize: parseFloat(mapRoomSizeInput.value) || defaultUiSettings.mapRoomSize,
            mapLineWidth: parseFloat(mapLineWidthInput.value) || defaultUiSettings.mapLineWidth,
            mapPlayerMarkerStrokeColor: mapPlayerMarkerStrokeColorInput.value || defaultUiSettings.mapPlayerMarkerStrokeColor,
            mapPlayerMarkerFillColor: mapPlayerMarkerFillColorInput.value || defaultUiSettings.mapPlayerMarkerFillColor,
            mapPlayerMarkerStrokeAlpha: parseFloat(mapPlayerMarkerStrokeAlphaInput.value) ?? defaultUiSettings.mapPlayerMarkerStrokeAlpha,
            mapPlayerMarkerFillAlpha: parseFloat(mapPlayerMarkerFillAlphaInput.value) ?? defaultUiSettings.mapPlayerMarkerFillAlpha,
            mapPlayerMarkerStrokeWidth: parseFloat(mapPlayerMarkerStrokeWidthInput.value) || defaultUiSettings.mapPlayerMarkerStrokeWidth,
            mapPlayerMarkerSizeFactor: parseFloat(mapPlayerMarkerSizeFactorInput.value) || defaultUiSettings.mapPlayerMarkerSizeFactor,
            mapPlayerMarkerDashEnabled: mapPlayerMarkerDashEnabledInput.checked,
            mapRoomShape: (mapRoomShapeInput.value === 'rectangle' || mapRoomShapeInput.value === 'circle' || mapRoomShapeInput.value === 'roundedRectangle')
                ? mapRoomShapeInput.value as MapRoomShape
                : defaultUiSettings.mapRoomShape,
            mapBackgroundColor: /^#[0-9a-f]{6}$/i.test(mapBackgroundColorInput.value)
                ? mapBackgroundColorInput.value
                : defaultUiSettings.mapBackgroundColor,
            mapLineColor: /^#[0-9a-f]{6}$/i.test(mapLineColorInput.value)
                ? mapLineColorInput.value
                : defaultUiSettings.mapLineColor,
            pathFindingAlgorithm: (pathFindingAlgorithmInput.value === 'dijkstra' || pathFindingAlgorithmInput.value === 'astar')
                ? pathFindingAlgorithmInput.value as PathFindingAlgorithm
                : defaultUiSettings.pathFindingAlgorithm,
            teamNumberingMode: (teamNumberingModeInput?.value === 'numbers' ? 'numbers' : 'letters') as 'letters' | 'numbers',
            objectContextMenuCommands: [...objectContextMenuCommands],
            footerComponents: [...footerComponentsConfig],
            commandEcho: commandEchoInput.checked,
            outputBottomPadding: Math.max(0, parseInt(outputBottomPaddingInput.value) || 0),
            outputMaxElements: Math.max(100, parseInt(outputMaxElementsInput.value) || defaultUiSettings.outputMaxElements),
            splitViewHeight: current.splitViewHeight,
            objectListBackgroundColor: /^#[0-9a-f]{6}$/i.test(objectListBgColorInput.value)
                ? objectListBgColorInput.value
                : defaultUiSettings.objectListBackgroundColor,
            objectListBackgroundAlpha: (() => {
                const v = parseFloat(objectListBgAlphaInput.value);
                return !isNaN(v) && v >= 0 && v <= 1 ? v : defaultUiSettings.objectListBackgroundAlpha;
            })(),
            alwaysVisibleBars: [...alwaysVisibleBarsConfig],
            barOrder: [...barOrderConfig],
        };
    }

    saveBtn.addEventListener('click', () => {
        current = read();
        if (current.transparentLabels) {
            current = { ...current, labelRenderMode: 'data' };
        }
        save(current);
        apply(current);
        (document.activeElement as HTMLElement)?.blur?.();
        modal.hide();
    });

    // Layout Manager controls
    const layoutManagerEnabledInput = modalEl.querySelector('#ui-layout-manager-enabled') as HTMLInputElement | null;
    const layoutManagerObjectListInput = modalEl.querySelector('#ui-layout-manager-object-list') as HTMLInputElement | null;
    const layoutManagerResetBtn = modalEl.querySelector('#ui-layout-manager-reset') as HTMLButtonElement | null;

    const updateLayoutPanelInputsState = () => {
        const enabled = layoutManagerEnabledInput?.checked ?? false;
        if (layoutManagerObjectListInput) layoutManagerObjectListInput.disabled = !enabled;
    };

    if (layoutManagerEnabledInput) {
        layoutManagerEnabledInput.addEventListener('change', () => {
            const layoutState = loadLayoutState();
            layoutState.enabled = layoutManagerEnabledInput.checked;
            saveLayoutState(layoutState);
            updateLayoutPanelInputsState();
            // Notify React context to pick up the change
            eventBus.emit('layoutManagerStateChanged');
        });
    }

    if (layoutManagerObjectListInput) {
        layoutManagerObjectListInput.addEventListener('change', () => {
            const layoutState = loadLayoutState();
            layoutState.enabledPanels.objectList = layoutManagerObjectListInput.checked;
            saveLayoutState(layoutState);
            eventBus.emit('layoutManagerStateChanged');
        });
    }

    if (layoutManagerResetBtn) {
        layoutManagerResetBtn.addEventListener('click', () => {
            resetLayoutState();
            // Notify React context to pick up the change
            eventBus.emit('layoutManagerStateChanged');
        });
    }

    button.addEventListener('click', async () => {
        current = load();
        populateFormInputs(current);
        updateLabelRenderModeState();
        updateCustomFontState();
        updateCustomThemeControls();
        refreshExplorationStats();
        // Populate layout manager state
        if (layoutManagerEnabledInput) {
            const layoutState = loadLayoutState();
            layoutManagerEnabledInput.checked = layoutState.enabled;
            if (layoutManagerObjectListInput) layoutManagerObjectListInput.checked = layoutState.enabledPanels.objectList;
            updateLayoutPanelInputsState();
        }
        modal.show();
    });

    // Restore original settings when modal is closed without saving
    modalEl.addEventListener('hidden.bs.modal', () => {
        // Restore map rendering settings to their saved values
        const s = getMapSettings();
        if (s) {
            s.roomSize = current.mapRoomSize;
            s.lineWidth = current.mapLineWidth;
            s.playerMarker.strokeAlpha = current.mapPlayerMarkerStrokeAlpha;
            s.playerMarker.fillAlpha = current.mapPlayerMarkerFillAlpha;
            s.playerMarker.strokeWidth = current.mapPlayerMarkerStrokeWidth;
            s.playerMarker.sizeFactor = current.mapPlayerMarkerSizeFactor;
            s.playerMarker.dashEnabled = current.mapPlayerMarkerDashEnabled;
            s.roomShape = current.mapRoomShape;
        }
        refreshEmbeddedMap();
    });

    // Initialize manage sounds modal
    const manageSoundsButton = document.getElementById('ui-manage-sounds-button');
    const manageSoundsModalEl = document.getElementById('manage-sounds-modal');

    if (manageSoundsButton && manageSoundsModalEl) {
        const manageSoundsModal = new Modal(manageSoundsModalEl);
        const manageSoundsList = document.getElementById('manage-sounds-list');
        const manageSoundsEmpty = document.getElementById('manage-sounds-empty');

        async function playSound(key: string, data?: string) {
            try {
                const { Howl } = await import('howler');
                let soundData: string | undefined = data;

                if (!soundData) {
                    if (key === 'beep') {
                        const { beepSound } = await import('../client/sounds');
                        soundData = beepSound;
                    } else {
                        const sound = customSoundsRef.current.find(s => s.key === key);
                        soundData = sound?.data;
                    }
                }

                if (!soundData) {
                    console.error('Sound data not found for key:', key);
                    return;
                }

                const howl = new Howl({
                    src: [soundData],
                    preload: true,
                });

                howl.once('load', () => {
                    howl.play();
                });

                howl.load();
            } catch (error) {
                console.error('Failed to play sound', error);
            }
        }

        async function renderSoundsList() {
            if (!manageSoundsList || !manageSoundsEmpty) return;

            manageSoundsList.innerHTML = '';

            manageSoundsList.style.display = 'flex';
            manageSoundsEmpty.style.display = 'none';

            // Add default beep sound (undeletable)
            const defaultBeepItem = document.createElement('div');
            defaultBeepItem.className = 'd-flex align-items-center justify-content-between p-2 border rounded';

            let defaultBeepData: string | undefined;
            try {
                const { beepSound } = await import('../client/sounds');
                defaultBeepData = beepSound;
            } catch (error) {
                console.error('Failed to load default beep sound', error);
            }

            const defaultBeepSize = defaultBeepData ? calculateBase64Size(defaultBeepData) : 0;

            defaultBeepItem.innerHTML = `
                <div class="d-flex flex-column">
                    <span class="fw-semibold">Domyślny beep</span>
                    <span class="text-muted small">${formatBytes(defaultBeepSize)}</span>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-primary btn-sm" data-play-key="beep">▶</button>
                </div>
            `;

            const defaultPlayBtn = defaultBeepItem.querySelector('[data-play-key]');
            defaultPlayBtn?.addEventListener('click', () => {
                void playSound('beep', defaultBeepData);
            });

            manageSoundsList.appendChild(defaultBeepItem);

            // Add custom sounds
            customSoundsRef.current.forEach(sound => {
                const size = calculateBase64Size(sound.data);
                const item = document.createElement('div');
                item.className = 'd-flex align-items-center justify-content-between p-2 border rounded';
                item.innerHTML = `
                    <div class="d-flex flex-column">
                        <span class="fw-semibold">${sound.name}</span>
                        <span class="text-muted small">${formatBytes(size)}</span>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary btn-sm" data-play-key="${sound.key}">▶</button>
                        <button class="btn btn-danger btn-sm" data-sound-key="${sound.key}">Usuń</button>
                    </div>
                `;

                const playBtn = item.querySelector('[data-play-key]');
                playBtn?.addEventListener('click', () => {
                    void playSound(sound.key, sound.data);
                });

                const deleteBtn = item.querySelector('[data-sound-key]');
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
                        populateCategoryOptions();
                        void renderSoundsList();
                    } catch (error) {
                        console.error('Failed to delete custom sound', error);
                        alert('Nie udało się usunąć dźwięku');
                    }
                });

                manageSoundsList.appendChild(item);
            });
        }

        manageSoundsButton.addEventListener('click', () => {
            void renderSoundsList();
            manageSoundsModal.show();
        });
    }

    // Map version display and refresh
    const mapVersionElement = document.getElementById('ui-map-version');
    const mapRefreshButton = document.getElementById('ui-map-refresh-btn');

    async function updateMapVersionDisplay() {
        if (!mapVersionElement) return;
        const { getMapVersion } = await import('./mapDataLoader');
        const version = await getMapVersion();
        mapVersionElement.textContent = version ? `v${version}` : '';
    }

    if (mapRefreshButton) {
        mapRefreshButton.addEventListener('click', async () => {
            mapRefreshButton.setAttribute('disabled', 'disabled');

            try {
                const { forceRefreshMapData, loadColors } = await import('./mapDataLoader');
                const [mapData, colors] = await Promise.all([
                    forceRefreshMapData(),
                    loadColors(),
                ]);

                const embedded = (globalThis as any).embedded;
                if (embedded?.initialize) {
                    embedded.initialize(mapData, colors);
                }

                await updateMapVersionDisplay();
            } catch (error) {
                console.error('Failed to refresh map data:', error);
            } finally {
                mapRefreshButton.removeAttribute('disabled');
            }
        });
    }

    // Update version when modal opens
    modalEl.addEventListener('show.bs.modal', () => {
        void updateMapVersionDisplay();
    });
}
