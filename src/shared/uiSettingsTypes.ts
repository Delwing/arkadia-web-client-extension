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

// UiSettings is decomposed into concern-scoped slices so each can be owned,
// stored, and synced independently (see the settings accessors in
// @modules/core/settings and the decomposition plan). `UiSettings` remains the
// full shape as the intersection of the slices, so existing consumers are
// unaffected. The intersection also makes the partition self-checking: if a
// field is dropped or misassigned, defaultUiSettings stops type-checking.

/** Document/browser-shell flags — relevant to any UI's outer frame. */
export interface ShellSettings {
    wakeLock: boolean;
    fightTitleIcon: boolean;
    hapticFeedback: boolean;
}

/** Terminal output + input rendering — portable across UIs. */
export interface RenderSettings {
    fontFamily: UiFontSelection;
    customFontUrl: string;
    customFontFamily: string;
    xtermPalette: 'arkadia' | 'proper';
    colorTheme: ColorTheme;
    customThemeColor?: string;
    outputBackground: string;
    outputBottomPadding: number;
    showTimestamps: boolean;
    /** Set apart whole reply blocks (inventory, loot, descriptions, …). */
    highlightMessageBlocks: boolean;
    commandEcho: boolean;
    clearInputOnSend: boolean;
    autoLowercaseCommands: boolean;
    soundCategories?: SoundCategories;
    customBeepSoundKey?: string;
}

/** Map rendering — portable across UIs that draw a map. */
export interface MapSettings {
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
    highlightCurrentRoom: boolean;
    labelRenderMode: 'image' | 'data' | 'none';
    transparentLabels: boolean;
    emojiLabels: boolean;
}

/** Movement / command / team behaviour the client and scripts act on. */
export interface BehaviorSettings {
    explorationMode: boolean;
    instantMove: boolean;
    drinkableAsFunctionalBind: boolean;
    gateAsFunctionalBind: boolean;
    teamNumberingMode: 'letters' | 'numbers';
    objectContextMenuCommands: string[];
}

/**
 * Device-scoped view preferences. Physically stored in the device-scoped
 * `uiSettings` blob (they are part of `ChromeSettings`), so font size, map zoom,
 * and output-buffer size stay tuned per physical device instead of syncing
 * across all of a user's devices like the portable render/map slices do.
 */
export interface DeviceViewSettings {
    contentFontSize: number;
    mapScale: number;
    outputMaxElements: number;
}

/** Stock-UI chrome — layout/panels specific to the bundled web UI. */
export interface ChromeSettings extends DeviceViewSettings {
    objectsFontSize: number;
    /** @deprecated Migrated to mobileButtonSettings.buttonSize */
    buttonSize?: number;
    showButtons: boolean;
    mapHeight: number;
    mapPosition: MapPosition;
    footerMode: number;
    footerComponents: FooterComponentConfig[];
    keepMultibindsVisible: boolean;
    splitViewHeight?: number;
    showCombatTimer?: boolean;
    showTransportLabel?: boolean;
    objectListBackgroundColor: string;
    objectListBackgroundAlpha: number;
    alwaysVisibleBars: string[];
    barOrder: string[];
}

export type UiSettings = ShellSettings & RenderSettings & MapSettings & BehaviorSettings & ChromeSettings;
