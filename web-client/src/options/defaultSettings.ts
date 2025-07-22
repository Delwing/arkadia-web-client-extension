export interface Settings {
    packageHelper: boolean;
    inlineCompassRose: boolean;
    shortenExits: boolean;
    prettyContainers: boolean;
    containerColumns: number;
    collectMode: number;
    collectMoneyType: number;
    collectExtra: string[];
    xtermPalette: 'arkadia' | 'proper';
}

export const defaultSettings: Settings = {
    packageHelper: true,
    inlineCompassRose: false,
    shortenExits: false,
    prettyContainers: true,
    containerColumns: 2,
    collectMode: 3,
    collectMoneyType: 1,
    collectExtra: [],
    xtermPalette: 'arkadia',
};
