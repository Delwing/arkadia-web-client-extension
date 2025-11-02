import { DEFAULT_ATTACK_COMMAND } from "./utils/attackCommand";
import { DEFAULT_DRAW_WEAPON_COMMAND } from "./utils/drawWeaponCommand";

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
    attackCommand: string;
    drawWeaponCommand: string;
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
    attackCommand: DEFAULT_ATTACK_COMMAND,
    drawWeaponCommand: DEFAULT_DRAW_WEAPON_COMMAND,
    fullHpMessage: false,
    lowHpAlert: 2,
    letterLineWidth: 72,
};
