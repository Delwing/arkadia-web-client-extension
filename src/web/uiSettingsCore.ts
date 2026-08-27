import {ensureFontLoaded, isUiFontSelection, UiFontSelection} from "./fontLoader";
import type { SoundCategory } from '@shared/events/clientEvents.ts';
import type { SoundCategories } from './defaultUiSettings';
import {
    defaultFooterComponents,
    defaultUiSettings,
    type ColorTheme,
    type FooterComponentConfig,
    type MapHighlightShape,
    type MapRoomShape,
    type PathFindingAlgorithm,
    type UiSettings
} from "./defaultUiSettings";
import {globalStorage} from "@modules/core/storage";
import {getEmbeddedMap} from "./embedRegistry";
import {
    setShellSettings,
    setRenderSettings,
    setMapSettings,
    setBehaviorSettings,
} from "@modules/core/settings";
import {chromeSettingsKeys} from "@shared/settingsDefaults";
import {loadLayoutState} from "@web/layout";
import {applyCustomTheme, generateRandomColor, removeCustomTheme} from "./themes/randomTheme";

// Re-export for backwards compatibility
export { defaultUiSettings, defaultFooterComponents, type UiSettings, type FooterComponentConfig, type MapHighlightShape, type MapRoomShape, type PathFindingAlgorithm, type ColorTheme } from "./defaultUiSettings";

export const ALL_SOUND_CATEGORIES: SoundCategory[] = [
    'attack', 'hp', 'fishing', 'lamp', 'gear',
    'transport', 'spell', 'block', 'weapon', 'stun',
];

export function hexAlphaToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function calculateBase64Size(dataUrl: string): number {
    const base64String = dataUrl.split(',')[1] || '';
    const padding = (base64String.match(/=/g) || []).length;
    return (base64String.length * 3 / 4) - padding;
}

export const mapPositions = [
    'top-overlay',
    'bottom-overlay',
    'right-overlay',
    'left-overlay',
    'top',
    'bottom',
    'right',
    'left',
] as const;

export type MapPosition = (typeof mapPositions)[number];

export const MIN_MAP_SCALE = 0.01;

function clampMapScale(value: number): number {
    if (!Number.isFinite(value)) {
        return MIN_MAP_SCALE;
    }
    const normalized = Math.abs(value);
    return normalized >= MIN_MAP_SCALE ? normalized : MIN_MAP_SCALE;
}

export function normalizeMapScale(value: unknown, fallback = defaultUiSettings.mapScale): number {
    const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return Math.max(fallback, MIN_MAP_SCALE);
    }
    return clampMapScale(numericValue);
}

export function validateFooterComponents(parsed: unknown): FooterComponentConfig[] {
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

export function guessFontFamilyFromUrl(href: string): string | undefined {
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

export async function guessFontFamilyFromStylesheet(href: string): Promise<string | undefined> {
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

export function resolveOutputFontFamily(selection: UiFontSelection, customFontFamily: string): string | undefined {
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

export function apply(settings: UiSettings) {
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
    const embedded = getEmbeddedMap();
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
        if (mapSettings.highlight) {
            mapSettings.highlight.strokeAlpha = settings.mapHighlightStrokeAlpha;
            mapSettings.highlight.fillAlpha = settings.mapHighlightFillAlpha;
            mapSettings.highlight.strokeWidth = settings.mapHighlightStrokeWidth;
            mapSettings.highlight.sizeFactor = settings.mapHighlightSizeFactor;
            mapSettings.highlight.dashEnabled = settings.mapHighlightDashEnabled;
            mapSettings.highlight.shape = settings.mapHighlightShape;
        }
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

export function load(): UiSettings {
    try {
        // Source the raw values from the concern-scoped accessors (which hold
        // the moved fields) plus the `uiSettings` blob (which keeps stock
        // chrome). The validation below is unchanged — only the source moved.
        // Compose the raw stored values: the uiSettings blob first (stock chrome,
        // plus any not-yet-migrated legacy fields), then the concern-scoped slice
        // keys, which are authoritative for the moved fields. Reading the slices
        // RAW (not default-merged) means an absent slice falls back to a legacy
        // uiSettings blob value here, with defaultUiSettings filling the rest at
        // the return below. defaultUiSettings is applied once, at the end.
        const readSlice = (key: 'shellSettings' | 'renderSettings' | 'mapSettings' | 'behaviorSettings'): Record<string, unknown> =>
            (globalStorage.get(key) as unknown as Record<string, unknown> | undefined) ?? {};
        const chrome = globalStorage.get('uiSettings');
        const parsed: any = {
            ...(chrome ?? {}),
            ...readSlice('shellSettings'),
            ...readSlice('renderSettings'),
            ...readSlice('mapSettings'),
            ...readSlice('behaviorSettings'),
        };
        {
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
            const mapHighlightStrokeAlpha = typeof parsed.mapHighlightStrokeAlpha === 'number'
                ? parsed.mapHighlightStrokeAlpha
                : defaultUiSettings.mapHighlightStrokeAlpha;
            const mapHighlightFillAlpha = typeof parsed.mapHighlightFillAlpha === 'number'
                ? parsed.mapHighlightFillAlpha
                : defaultUiSettings.mapHighlightFillAlpha;
            const mapHighlightStrokeWidth = typeof parsed.mapHighlightStrokeWidth === 'number'
                ? parsed.mapHighlightStrokeWidth
                : defaultUiSettings.mapHighlightStrokeWidth;
            const mapHighlightSizeFactor = typeof parsed.mapHighlightSizeFactor === 'number'
                ? parsed.mapHighlightSizeFactor
                : defaultUiSettings.mapHighlightSizeFactor;
            const mapHighlightDashEnabled = typeof parsed.mapHighlightDashEnabled === 'boolean'
                ? parsed.mapHighlightDashEnabled
                : defaultUiSettings.mapHighlightDashEnabled;
            const mapHighlightShape = (parsed.mapHighlightShape === 'match' || parsed.mapHighlightShape === 'rectangle' || parsed.mapHighlightShape === 'circle' || parsed.mapHighlightShape === 'roundedRectangle')
                ? parsed.mapHighlightShape as MapHighlightShape
                : defaultUiSettings.mapHighlightShape;
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
            const gateAsFunctionalBind = typeof parsed.gateAsFunctionalBind === 'boolean'
                ? parsed.gateAsFunctionalBind
                : defaultUiSettings.gateAsFunctionalBind;
            const dismountOnRefusedRide = typeof parsed.dismountOnRefusedRide === 'boolean'
                ? parsed.dismountOnRefusedRide
                : defaultUiSettings.dismountOnRefusedRide;
            const carriageRouteBinds = typeof parsed.carriageRouteBinds === 'boolean'
                ? parsed.carriageRouteBinds
                : defaultUiSettings.carriageRouteBinds;
            const wakeLock = typeof parsed.wakeLock === 'boolean'
                ? parsed.wakeLock
                : defaultUiSettings.wakeLock;
            const commandEcho = typeof parsed.commandEcho === 'boolean'
                ? parsed.commandEcho
                : defaultUiSettings.commandEcho;
            const showTimestamps = typeof parsed.showTimestamps === 'boolean'
                ? parsed.showTimestamps
                : defaultUiSettings.showTimestamps;
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
                mapHighlightStrokeAlpha,
                mapHighlightFillAlpha,
                mapHighlightStrokeWidth,
                mapHighlightSizeFactor,
                mapHighlightDashEnabled,
                mapHighlightShape,
                mapRoomShape,
                pathFindingAlgorithm,
                objectContextMenuCommands,
                footerComponents,
                keepMultibindsVisible,
                drinkableAsFunctionalBind,
                gateAsFunctionalBind,
                dismountOnRefusedRide,
                carriageRouteBinds,
                wakeLock,
                commandEcho,
                showTimestamps,
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

export function save(settings: UiSettings) {
    // Fan out the unified settings object to the concern-scoped keys; stock
    // chrome stays in the `uiSettings` key. Each accessor.set() only writes the
    // fields it owns, so slices never clobber one another.
    setShellSettings(settings);
    setRenderSettings(settings);
    setMapSettings(settings);
    setBehaviorSettings(settings);
    const source = settings as unknown as Record<string, unknown>;
    const chrome: Record<string, unknown> = {};
    for (const key of chromeSettingsKeys) {
        if (key in source) {
            chrome[key] = source[key];
        }
    }
    globalStorage.set('uiSettings', chrome as never);
}
