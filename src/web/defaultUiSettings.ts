import type { SoundCategory } from '@shared/events/clientEvents.ts';

// string = custom sound key, null = disabled, missing key = default beep
export type SoundCategories = Partial<Record<SoundCategory, string | null>>;

type MapPosition = 'top-overlay' | 'bottom-overlay' | 'right-overlay' | 'left-overlay' | 'top' | 'bottom' | 'right' | 'left';

type UiFontSelection = 'default' | 'fira-code' | 'jetbrains-mono' | 'cascadia-mono' | 'custom';

export type MapRoomShape = 'rectangle' | 'circle' | 'roundedRectangle';

export type PathFindingAlgorithm = 'dijkstra' | 'astar';

export type ColorTheme = 'default' | 'fantasy' | 'forest' | 'icy' | 'gray' | 'dark-neutral' | 'light-parchment' | 'light-silver' | 'custom-dark';

export interface FooterComponentConfig {
    id: string;
    visible: boolean;
    order: number;
}

export const defaultFooterComponents: FooterComponentConfig[] = [
    { id: 'clock-display', visible: true, order: 0 },
    { id: 'transport-timer', visible: true, order: 1 },
    { id: 'lamp-timer', visible: true, order: 2 },
    { id: 'break-item-warning', visible: true, order: 3 },
    { id: 'mail-status', visible: true, order: 4 },
    { id: 'package-status', visible: true, order: 5 },
    { id: 'weapon-state', visible: true, order: 6 },
    { id: 'attack-mode', visible: true, order: 7 },
    { id: 'release-guard-timer', visible: true, order: 8 },
    { id: 'zask-timer', visible: true, order: 9 },
    { id: 'order-timer', visible: true, order: 10 },
    { id: 'combat-timer', visible: true, order: 11 },
    { id: 'world-destruction-timer', visible: true, order: 12 },
];

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
    labelRenderMode: 'image' | 'data';
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
}

export const defaultUiSettings: UiSettings = {
    contentFontSize: 0.775,
    objectsFontSize: 0.6,
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
    mapRoomShape: 'rectangle',
    mapBackgroundColor: '#000000',
    mapLineColor: '#e1ffe1',
    pathFindingAlgorithm: 'dijkstra',
    objectContextMenuCommands: ['ob', 'ocen', 'zapros', 'wskaz'],
    footerComponents: defaultFooterComponents,
    keepMultibindsVisible: false,
    wakeLock: true,
    commandEcho: true,
    outputBottomPadding: 0,
    teamNumberingMode: 'letters',
    drinkableAsFunctionalBind: true,
    objectListBackgroundColor: '#000000',
    objectListBackgroundAlpha: 0.4,
    alwaysVisibleBars: [],
    barOrder: ['hp', 'fatigue', 'stuffed', 'encumbrance', 'soaked', 'mana', 'improve', 'form', 'intox', 'headache', 'panic'],
    colorTheme: 'default',
    soundCategories: {},
};
