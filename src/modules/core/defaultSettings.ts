import { DEFAULT_ATTACK_COMMAND } from "@client/utils/attackCommand";
import { DEFAULT_DRAW_WEAPON_COMMAND } from "@client/utils/drawWeaponCommand";
import { DEFAULT_SUPPORT_COMMAND } from "@client/utils/supportCommand";

export interface CollectOverride {
    enemy: string;
    collectCopper: boolean;
    collectSilver: boolean;
    collectGold: boolean;
    collectGems: boolean;
    collectExtra: string[];
}

export interface Settings {
    packageHelper: boolean;
    packageInContainer: boolean;
    inlineCompassRose: number;
    compassBackExits: boolean;
    shortenExits: boolean;
    shortExitsPrefix?: string;
    shortExitsColor?: string;
    shortExitsSeparator?: string;
    shortExitsBackgroundColor?: string;
    prettyContainers: boolean;
    containerColumns: number;
    containerOpen: boolean;
    containerClose: boolean;
    collectMode: number;
    collectTiming: number;
    collectCopper: boolean;
    collectSilver: boolean;
    collectGold: boolean;
    collectGems: boolean;
    collectExtra: string[];
    collectOverrides: CollectOverride[];
    language: string;
    languageAdjective: string;
    languageAliases: { alias: string; adjective: string; language: string }[];
    herbPreUseCommand: string;
    herbPostUseCommand: string;
    herbWieleCount: number;
    attackCommand: string;
    supportCommand: string;
    drawWeaponCommand: string;
    fullHpMessage: boolean;
    lowHpAlert: number;
    letterLineWidth: number;
    guilds?: string[];
    enemyGuilds?: string[];
    allyGuilds?: string[];
    guildColors?: Record<string, string | undefined>;
    enemyBindsKeepUnchanged: boolean;
    enemyBindsShowMode: 'always' | 'whenBound' | 'never';
    enemyBindsEnabledSlots: [boolean, boolean, boolean];
    favoriteMagicTypes?: string[];
    favoriteMagicKeys?: string[];
    magicsColor?: string;
    magicKeysColor?: string;
    cuttingPreAction?: string;
    cuttingPostAction?: string;
    sunTracker: boolean;
    zlomSilver?: {
        color: string;
        off?: boolean;
    };
    dobCommand1: string;
    dobCommand2: string;
    dobCommand3: string;
    opCommand1: string;
    opCommand2: string;
    opCommand3: string;
}

export const defaultSettings: Settings = {
    packageHelper: true,
    packageInContainer: false,
    inlineCompassRose: 0,
    compassBackExits: false,
    shortenExits: false,
    shortExitsPrefix: '-----:',
    shortExitsColor: '#ffa500',
    shortExitsSeparator: ' ',
    shortExitsBackgroundColor: 'transparent',
    prettyContainers: true,
    containerColumns: 2,
    containerOpen: true,
    containerClose: true,
    collectMode: 1,
    collectTiming: 1,
    collectCopper: true,
    collectSilver: true,
    collectGold: true,
    collectGems: true,
    collectExtra: [],
    collectOverrides: [
        { enemy: 'troll', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'bykocentaur', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'ghoul', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'grzyboczlek', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'bagiennik', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'zjawa', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'wiwerna', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'wyverna', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'harpia', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'krasnozwierz', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'bestia', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'zywiolak ziemi', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'zywiolak wody', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'zywiolak powietrza', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
        { enemy: 'zywiolak ognia', collectCopper: false, collectSilver: false, collectGold: false, collectGems: true, collectExtra: [] },
    ],
    language: 'potoczna',
    languageAdjective: '',
    languageAliases: [],
    herbPreUseCommand: '',
    herbPostUseCommand: '',
    herbWieleCount: 25,
    attackCommand: DEFAULT_ATTACK_COMMAND,
    supportCommand: DEFAULT_SUPPORT_COMMAND,
    drawWeaponCommand: DEFAULT_DRAW_WEAPON_COMMAND,
    fullHpMessage: false,
    lowHpAlert: 2,
    letterLineWidth: 72,
    guilds: [],
    enemyGuilds: [],
    allyGuilds: [],
    guildColors: {},
    enemyBindsKeepUnchanged: false,
    enemyBindsShowMode: 'always',
    enemyBindsEnabledSlots: [true, true, true],
    favoriteMagicTypes: [],
    favoriteMagicKeys: [],
    magicsColor: '#d75f5f',
    magicKeysColor: '#00ff87',
    cuttingPreAction: '',
    cuttingPostAction: '',
    sunTracker: false,
    zlomSilver: { color: '#dadada' },
    dobCommand1: '',
    dobCommand2: '',
    dobCommand3: '',
    opCommand1: '',
    opCommand2: '',
    opCommand3: '',
};
