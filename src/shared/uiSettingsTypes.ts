import type { SoundCategory } from '@shared/events/clientEvents';

// UI settings type definitions.
//
// These live in `@shared` (UI-neutral) so that lower layers — the storage
// schema in `@modules` and the client's plugin API — can reference the settings
// shape without importing `@web`. The concrete default values still live in
// `@web/defaultUiSettings`, which re-exports these types for existing importers.

// string = custom sound key, null = disabled, missing key = default beep
export type SoundCategories = Partial<Record<SoundCategory, string | null>>;

export type MapPosition = 'top-overlay' | 'bottom-overlay' | 'right-overlay' | 'left-overlay' | 'top' | 'bottom' | 'right' | 'left';

export type UiFontSelection = 'default' | 'fira-code' | 'jetbrains-mono' | 'cascadia-mono' | 'custom';

export type MapRoomShape = 'rectangle' | 'circle' | 'roundedRectangle';

export type MapHighlightShape = 'match' | 'rectangle' | 'roundedRectangle' | 'circle';

export type PathFindingAlgorithm = 'dijkstra' | 'astar';

export type ColorTheme = 'default' | 'fantasy' | 'forest' | 'icy' | 'gray' | 'dark-neutral' | 'light-parchment' | 'light-silver' | 'custom-dark';

export interface FooterComponentConfig {
    id: string;
    visible: boolean;
    order: number;
}

export interface UiSettings {
    contentFontSize: number;
    objectsFontSize: number;
    /** @deprecated Migrated to mobileButtonSettings.buttonSize */
    buttonSize?: number;
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
    labelRenderMode: 'image' | 'data' | 'none';
    transparentLabels: boolean;
    outputBackground: string;
    clearInputOnSend: boolean;
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
    mapHighlightStrokeAlpha: number;
    mapHighlightFillAlpha: number;
    mapHighlightStrokeWidth: number;
    mapHighlightSizeFactor: number;
    mapHighlightDashEnabled: boolean;
    mapHighlightShape: MapHighlightShape;
    mapRoomShape: MapRoomShape;
    mapBackgroundColor: string;
    mapLineColor: string;
    pathFindingAlgorithm: PathFindingAlgorithm;
    objectContextMenuCommands: string[];
    footerComponents: FooterComponentConfig[];
    keepMultibindsVisible: boolean;
    wakeLock: boolean;
    commandEcho: boolean;
    outputBottomPadding: number;
    outputMaxElements: number;
    splitViewHeight?: number;
    showCombatTimer?: boolean;
    showTransportLabel?: boolean;
    teamNumberingMode: 'letters' | 'numbers';
    drinkableAsFunctionalBind: boolean;
    objectListBackgroundColor: string;
    objectListBackgroundAlpha: number;
    alwaysVisibleBars: string[];
    barOrder: string[];
    colorTheme: ColorTheme;
    customThemeColor?: string;
    soundCategories?: SoundCategories;
    showTimestamps: boolean;
}
