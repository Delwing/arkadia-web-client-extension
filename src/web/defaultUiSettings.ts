type MapPosition = 'top-overlay' | 'bottom-overlay' | 'right-overlay' | 'left-overlay' | 'top' | 'bottom' | 'right' | 'left';

type UiFontSelection = 'default' | 'fira-code' | 'jetbrains-mono' | 'cascadia-mono' | 'custom';

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
    objectContextMenuCommands: string[];
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
    objectContextMenuCommands: ['ob', 'ocen', 'zapros', 'wskaz'],
};
