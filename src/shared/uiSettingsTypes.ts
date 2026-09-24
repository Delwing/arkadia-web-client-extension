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

export type UiFontSelection = 'default' | 'fira-code' | 'jetbrains-mono' | 'cascadia-mono' | 'vera-sans-mono' | 'custom';

export type MapRoomShape = 'rectangle' | 'circle' | 'roundedRectangle';

export type MapHighlightShape = 'match' | 'rectangle' | 'roundedRectangle' | 'circle';

export type PathFindingAlgorithm = 'dijkstra' | 'astar';

export type ColorTheme = 'default' | 'fantasy' | 'forest' | 'icy' | 'gray' | 'dark-neutral' | 'light-parchment' | 'light-silver' | 'custom-dark';

export interface FooterComponentConfig {
    id: string;
    visible: boolean;
    order: number;
}

/** A button the player put next to the command line (see footerButtonRegistry). */
export interface FooterButtonConfig {
    id: string;
    label: string;
    /** Sent on click: a command, an alias, anything the command line accepts. */
    command: string;
    tone?: 'neutral' | 'accent' | 'danger';
    /** Flag this button lights up from, flipped by a trigger, script or plugin. */
    state?: string;
    /** Kept in the settings list but left out of the footer. */
    hidden?: boolean;
    order?: number;
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
    mapCurrentRoomColor: string;
    pathFindingAlgorithm: PathFindingAlgorithm;
    highlightCurrentRoom: boolean;
    labelRenderMode: 'image' | 'data' | 'none';
    transparentLabels: boolean;
    emojiLabels: boolean;
}

export type MobileFooterExpandSetting = 'toggle' | 'expanded' | 'collapsed';

export type MultibindKeyHints = 'auto' | 'always' | 'never';

/** Movement / command / team behaviour the client and scripts act on. */
export interface BehaviorSettings {
    explorationMode: boolean;
    instantMove: boolean;
    drinkableAsFunctionalBind: boolean;
    gateAsFunctionalBind: boolean;
    /** Repeat a refused ride to get off and walk it instead, as two commands. */
    dismountOnRefusedRide: boolean;
    /** Offer the next step, or the way out, on the functional bind while leading by carriage. */
    carriageRouteBinds: boolean;
    teamNumberingMode: 'letters' | 'numbers';
    objectContextMenuCommands: string[];
    /**
     * Hold back push notifications while the client tab is on screen.
     *
     * Off by default: someone who paired a phone generally wants the alert
     * whether or not a tab happens to be focused — walking to the kitchen does
     * not hide the tab.
     */
    pushOnlyWhenHidden: boolean;
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
    /** Mic button in the command bar. Off leaves the bar without dictation. */
    showVoiceButton: boolean;
    /** Dimmed hint after the caret of what Tab would complete. */
    tabCompletionHint: boolean;
    /** How Tab and the right arrow take a completion (see CommandLineEngine's TabCompletionMode). */
    tabCompletionMode: 'cycle' | 'word' | 'whole';
    mapHeight: number;
    mapPosition: MapPosition;
    footerMode: number;
    footerComponents: FooterComponentConfig[];
    /** The player's own buttons beside the command line; empty out of the box. */
    footerButtons: FooterButtonConfig[];
    /**
     * Pull warn/danger chips to the front of the footer (danger first), each
     * group in the configured order. Off by default: chips keep their
     * configured slot whatever their tone, so they do not jump around.
     */
    footerUrgentChipsFirst: boolean;
    /**
     * The phone footer: two fixed-height scrolling rails plus compact stat
     * meters, instead of the desktop footer's one wrapping row. On by default;
     * off restores the old layout on narrow screens. Desktop is unaffected
     * either way. See src/web/mobileFooter.ts.
     */
    mobileFooterCompact: boolean;
    /**
     * How that footer folds: 'toggle' rests folded with the expander offered,
     * 'expanded' / 'collapsed' pin it open or shut and drop the expander.
     */
    mobileFooterExpand: MobileFooterExpandSetting;
    keepMultibindsVisible: boolean;
    /**
     * Whether the location-bind pills lead with their keyboard shortcut.
     * 'auto' shows them only where a physical keyboard can be found (see
     * @shared/dom/hardwareKeyboard); 'always' / 'never' settle it by hand.
     */
    multibindKeyHints: MultibindKeyHints;
    splitViewHeight?: number;
    showCombatTimer?: boolean;
    showTransportLabel?: boolean;
    objectListBackgroundColor: string;
    objectListBackgroundAlpha: number;
    alwaysVisibleBars: string[];
    barOrder: string[];
    /**
     * Speech synthesis for `speak` trigger macros (and `tts:speak` from plugins).
     * Device-scoped on purpose: the installed voices differ per device, so a
     * voice picked on the desktop means nothing on the phone.
     */
    ttsEnabled: boolean;
    /** `voiceURI` of the chosen voice; empty picks a Polish voice, else the browser default. */
    ttsVoice: string;
    ttsRate: number;
    ttsPitch: number;
    ttsVolume: number;
    /** A new message cuts off the one being read instead of queueing after it. */
    ttsInterrupt: boolean;
}

export type UiSettings = ShellSettings & RenderSettings & MapSettings & BehaviorSettings & ChromeSettings;
