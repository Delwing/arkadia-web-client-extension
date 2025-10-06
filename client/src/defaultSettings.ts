export interface Settings {
    packageHelper: boolean;
    inlineCompassRose: boolean;
    shortenExits: boolean;
    prettyContainers: boolean;
    containerColumns: number;
    collectMode: number;
    collectMoneyType: number;
    collectExtra: string[];
    language: string;
    languageAdjective: string;
    languageAliases: { alias: string; adjective: string; language: string }[];
    herbPreUseCommand: string;
    herbPostUseCommand: string;
    fullHpMessage: boolean;
    lowHpAlert: number;
    letterLineWidth: number;
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
    language: 'potoczna',
    languageAdjective: '',
    languageAliases: [],
    herbPreUseCommand: '',
    herbPostUseCommand: '',
    fullHpMessage: false,
    lowHpAlert: 2,
    letterLineWidth: 72,
};
