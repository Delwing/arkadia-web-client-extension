import type {
    ShellSettings,
    RenderSettings,
    MapSettings,
    BehaviorSettings,
    ChromeSettings,
    DeviceViewSettings,
} from './uiSettingsTypes';

// Default values for the portable settings slices, plus the explicit field-key
// lists that drive the settings accessors (@modules/core/settings). These live
// in @shared so both the client and any UI (including the forge UI) can use them
// without importing @web. Stock-chrome defaults stay in @web/defaultUiSettings
// (they reference stock-only values like the footer component list).

export const defaultShellSettings: ShellSettings = {
    wakeLock: true,
    fightTitleIcon: true,
    hapticFeedback: true,
};

export const defaultRenderSettings: RenderSettings = {
    fontFamily: 'default',
    customFontUrl: '',
    customFontFamily: '',
    xtermPalette: 'arkadia',
    colorTheme: 'default',
    outputBackground: '#242424',
    outputBottomPadding: 0,
    showTimestamps: false,
    commandEcho: true,
    clearInputOnSend: false,
    autoLowercaseCommands: false,
    soundCategories: {},
    customBeepSoundKey: undefined,
};

export const defaultMapSettings: MapSettings = {
    mapRoomSize: 0.6,
    mapLineWidth: 0.025,
    mapPlayerMarkerStrokeColor: '#00e5b2',
    mapPlayerMarkerStrokeAlpha: 1,
    mapPlayerMarkerFillColor: '#00e5b2',
    mapPlayerMarkerFillAlpha: 0,
    mapPlayerMarkerStrokeWidth: 0.1,
    mapPlayerMarkerSizeFactor: 1.7,
    mapPlayerMarkerDashEnabled: true,
    mapHighlightStrokeAlpha: 1,
    mapHighlightFillAlpha: 0,
    mapHighlightStrokeWidth: 0.1,
    mapHighlightSizeFactor: 1.425,
    mapHighlightDashEnabled: true,
    mapHighlightShape: 'match',
    mapRoomShape: 'rectangle',
    mapBackgroundColor: '#000000',
    mapLineColor: '#e1ffe1',
    pathFindingAlgorithm: 'dijkstra',
    highlightCurrentRoom: true,
    labelRenderMode: 'data',
    transparentLabels: true,
    emojiLabels: false,
};

// Device-scoped view prefs. Stored inside the device-scoped `uiSettings` blob
// (part of ChromeSettings), so they are read/written through the deviceView
// accessor rather than the portable render/map slices — keeping font size, map
// zoom, and buffer size per-device instead of syncing across devices.
export const defaultDeviceViewSettings: DeviceViewSettings = {
    contentFontSize: 0.775,
    mapScale: 0.30,
    outputMaxElements: 1000,
    preferredShell: 'stock',
};

export const defaultBehaviorSettings: BehaviorSettings = {
    explorationMode: false,
    instantMove: true,
    drinkableAsFunctionalBind: true,
    teamNumberingMode: 'letters',
    objectContextMenuCommands: ['ob', 'ocen', 'zapros', 'wskaz'],
};

// Explicit key lists (include optional fields, so accessors pick them out of a
// stored blob even when the default omits them).
export const shellSettingsKeys = [
    'wakeLock', 'fightTitleIcon', 'hapticFeedback',
] as const satisfies readonly (keyof ShellSettings)[];

export const renderSettingsKeys = [
    'fontFamily', 'customFontUrl', 'customFontFamily',
    'xtermPalette', 'colorTheme', 'customThemeColor', 'outputBackground',
    'outputBottomPadding', 'showTimestamps', 'commandEcho',
    'clearInputOnSend', 'autoLowercaseCommands', 'soundCategories', 'customBeepSoundKey',
] as const satisfies readonly (keyof RenderSettings)[];

export const mapSettingsKeys = [
    'mapRoomSize', 'mapLineWidth', 'mapPlayerMarkerStrokeColor',
    'mapPlayerMarkerStrokeAlpha', 'mapPlayerMarkerFillColor', 'mapPlayerMarkerFillAlpha',
    'mapPlayerMarkerStrokeWidth', 'mapPlayerMarkerSizeFactor', 'mapPlayerMarkerDashEnabled',
    'mapHighlightStrokeAlpha', 'mapHighlightFillAlpha', 'mapHighlightStrokeWidth',
    'mapHighlightSizeFactor', 'mapHighlightDashEnabled', 'mapHighlightShape', 'mapRoomShape',
    'mapBackgroundColor', 'mapLineColor', 'pathFindingAlgorithm', 'highlightCurrentRoom',
    'labelRenderMode', 'transparentLabels', 'emojiLabels',
] as const satisfies readonly (keyof MapSettings)[];

export const behaviorSettingsKeys = [
    'explorationMode', 'instantMove', 'drinkableAsFunctionalBind',
    'teamNumberingMode', 'objectContextMenuCommands',
] as const satisfies readonly (keyof BehaviorSettings)[];

// Device-scoped view prefs read/written through the deviceView accessor. Kept
// distinct from the portable slices so they never move out of `uiSettings`
// during the v10 split migration (they are absent from the slice key-lists).
export const deviceViewSettingsKeys = [
    'contentFontSize', 'mapScale', 'outputMaxElements', 'preferredShell',
] as const satisfies readonly (keyof DeviceViewSettings)[];

// Stock-UI chrome stays in the `uiSettings` key. This list drives the save()
// fan-out (which writes chrome fields back to `uiSettings`). It includes the
// device-scoped view prefs above, so save() persists them to `uiSettings`.
export const chromeSettingsKeys = [
    'contentFontSize', 'mapScale', 'outputMaxElements', 'preferredShell',
    'objectsFontSize', 'buttonSize', 'showButtons', 'mapHeight', 'mapPosition',
    'footerMode', 'footerComponents', 'keepMultibindsVisible', 'splitViewHeight',
    'showCombatTimer', 'showTransportLabel', 'objectListBackgroundColor',
    'objectListBackgroundAlpha', 'alwaysVisibleBars', 'barOrder',
] as const satisfies readonly (keyof ChromeSettings)[];
