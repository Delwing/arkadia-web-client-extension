import { DEFAULT_ATTACK_COMMAND } from "@client/utils/attackCommand";
import { DEFAULT_DRAW_WEAPON_COMMAND } from "@client/utils/drawWeaponCommand";

export interface Settings {
    packageHelper: boolean;
    inlineCompassRose: boolean;
    shortenExits: boolean;
    prettyContainers: boolean;
    containerColumns: number;
    collectMode: number;
    collectTiming: number;
    collectCopper: boolean;
    collectSilver: boolean;
    collectGold: boolean;
    collectGems: boolean;
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
    guilds?: string[];
    enemyGuilds?: string[];
    guildColors?: Record<string, string | undefined>;
    enemyBindsKeepUnchanged: boolean;
    enemyBindsShowMode: 'always' | 'whenBound' | 'never';
    enemyBindsEnabledSlots: [boolean, boolean, boolean];
}

export const defaultSettings: Settings = {
    packageHelper: true,
    inlineCompassRose: false,
    shortenExits: false,
    prettyContainers: true,
    containerColumns: 2,
    collectMode: 1,
    collectTiming: 1,
    collectCopper: true,
    collectSilver: true,
    collectGold: true,
    collectGems: true,
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
    guilds: [],
    enemyGuilds: [],
    guildColors: {},
    enemyBindsKeepUnchanged: false,
    enemyBindsShowMode: 'always',
    enemyBindsEnabledSlots: [true, true, true],
};
