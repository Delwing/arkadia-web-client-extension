import type {
    ShellSettings,
    RenderSettings,
    MapSettings,
    BehaviorSettings,
    ChromeSettings,
} from './uiSettingsTypes';

// Default values for the portable settings slices, plus the explicit field-key
// lists that drive the settings accessors (@modules/core/settings). These live
// in @shared so both the client and any UI (including the alt UI) can use them
// without importing @web. Stock-chrome defaults stay in @web/defaultUiSettings
// (they reference stock-only values like the footer component list).

export const defaultShellSettings: ShellSettings = {
    wakeLock: true,
    fightTitleIcon: true,
    hapticFeedback: true,
};

export const defaultRenderSettings: RenderSettings = {
    contentFontSize: 0.775,
    fontFamily: 'default',
    customFontUrl: '',
    customFontFamily: '',
    xtermPalette: 'arkadia',
    colorTheme: 'default',
    outputBackground: '#242424',
    outputMaxElements: 1000,
    outputBottomPadding: 0,
    showTimestamps: false,
    commandEcho: true,
    clearInputOnSend: false,
    autoLowercaseCommands: false,
    soundCategories: {},
    customBeepSoundKey: undefined,
};

export const defaultMapSettings: MapSettings = {
    mapScale: 0.30,
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
    'contentFontSize', 'fontFamily', 'customFontUrl', 'customFontFamily',
    'xtermPalette', 'colorTheme', 'customThemeColor', 'outputBackground',
    'outputMaxElements', 'outputBottomPadding', 'showTimestamps', 'commandEcho',
    'clearInputOnSend', 'autoLowercaseCommands', 'soundCategories', 'customBeepSoundKey',
] as const satisfies readonly (keyof RenderSettings)[];

export const mapSettingsKeys = [
    'mapScale', 'mapRoomSize', 'mapLineWidth', 'mapPlayerMarkerStrokeColor',
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

// Stock-UI chrome stays in the `uiSettings` key. This list drives the save()
// fan-out (which writes chrome fields back to `uiSettings`).
export const chromeSettingsKeys = [
    'objectsFontSize', 'buttonSize', 'showButtons', 'mapHeight', 'mapPosition',
    'footerMode', 'footerComponents', 'keepMultibindsVisible', 'splitViewHeight',
    'showCombatTimer', 'showTransportLabel', 'objectListBackgroundColor',
    'objectListBackgroundAlpha', 'alwaysVisibleBars', 'barOrder',
] as const satisfies readonly (keyof ChromeSettings)[];
