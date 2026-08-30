// UI settings type definitions live in `@shared/uiSettingsTypes` (UI-neutral) so
// lower layers can reference them without importing `@web`. They are re-exported
// here to preserve the historical `@web/defaultUiSettings` import path.
export type {
    SoundCategories,
    MapPosition,
    UiFontSelection,
    MapRoomShape,
    MapHighlightShape,
    PathFindingAlgorithm,
    ColorTheme,
    FooterComponentConfig,
    UiSettings,
} from '@shared/uiSettingsTypes';
import type { ChromeSettings, FooterComponentConfig, UiSettings } from '@shared/uiSettingsTypes';
import {
    defaultShellSettings,
    defaultRenderSettings,
    defaultMapSettings,
    defaultBehaviorSettings,
    defaultDeviceViewSettings,
} from '@shared/settingsDefaults';

export const defaultFooterComponents: FooterComponentConfig[] = [
    { id: 'clock-display', visible: true, order: 0 },
    { id: 'transport-timer', visible: true, order: 1 },
    { id: 'lamp-timer', visible: true, order: 2 },
    { id: 'pipe-status', visible: true, order: 3 },
    { id: 'break-item-warning', visible: true, order: 4 },
    { id: 'mail-status', visible: true, order: 5 },
    { id: 'package-status', visible: true, order: 6 },
    { id: 'weapon-state', visible: true, order: 7 },
    { id: 'attack-mode', visible: true, order: 8 },
    { id: 'release-guard-timer', visible: true, order: 9 },
    { id: 'zask-timer', visible: true, order: 10 },
    { id: 'order-timer', visible: true, order: 11 },
    { id: 'combat-timer', visible: true, order: 12 },
    { id: 'world-destruction-timer', visible: true, order: 13 },
    { id: 'team-panel', visible: true, order: 14 },
    // Off by default: a diagnostic, not something to watch while playing.
    { id: 'connection-status', visible: false, order: 15 },
];

/** Stock-UI chrome defaults (this UI only); references the stock footer list. */
export const defaultChromeSettings: ChromeSettings = {
    // Device-scoped view prefs (font size / map zoom / buffer size) are part of
    // the chrome blob, so their defaults come from the shared source of truth.
    ...defaultDeviceViewSettings,
    objectsFontSize: 0.6,
    showButtons: true,
    mapHeight: typeof window !== 'undefined' && window.innerWidth < 768 ? 25 : 30,
    mapPosition: 'top-overlay',
    footerMode: 0,
    footerComponents: defaultFooterComponents,
    keepMultibindsVisible: false,
    objectListBackgroundColor: '#000000',
    objectListBackgroundAlpha: 0.4,
    alwaysVisibleBars: [],
    barOrder: ['hp', 'fatigue', 'stuffed', 'encumbrance', 'soaked', 'mana', 'improve', 'form', 'intox', 'headache', 'panic'],
};

// The full stock default is composed from the concern slices — one source of
// truth. Existing importers of `defaultUiSettings` see the identical shape.
export const defaultUiSettings: UiSettings = {
    ...defaultShellSettings,
    ...defaultRenderSettings,
    ...defaultMapSettings,
    ...defaultBehaviorSettings,
    ...defaultChromeSettings,
};
