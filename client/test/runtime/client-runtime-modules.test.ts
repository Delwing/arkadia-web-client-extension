import type Client from "../../src/Client";
import type { RuntimeEvents } from "../../src/runtime/event-hub";
import type { SettingsService, SettingsSnapshot } from "../../src/runtime/settings/settings-service";
import type { CommandDispatcher } from "../../src/runtime/command-dispatcher";
type ClientRuntimeConstructor = typeof import("../../src/runtime/client-runtime").default;
type EventHubConstructor = typeof import("../../src/runtime/event-hub").EventHub;
type DefaultDataCatalogConstructor = typeof import("../../src/runtime/data").DefaultDataCatalog;
type RegisterLegacyModulesFn = typeof import("../../src/runtime/modules/legacy-modules").registerLegacyModules;

const moduleCallOrder: string[] = [];
const moduleMocks: Record<string, jest.Mock> = {};

function mockDefaultModule(path: string, name: string, returnValue?: unknown) {
    jest.mock(path, () => {
        const fn = jest.fn(() => {
            moduleCallOrder.push(name);
            return returnValue;
        });
        moduleMocks[name] = fn;
        return { __esModule: true, default: fn };
    });
}

function mockNamedModule(path: string, exportName: string, name: string, returnValue?: unknown) {
    jest.mock(path, () => {
        const fn = jest.fn(() => {
            moduleCallOrder.push(name);
            return returnValue;
        });
        moduleMocks[name] = fn;
        return { __esModule: true, [exportName]: fn };
    });
}

mockDefaultModule("../../src/People", "People");
mockDefaultModule("../../src/scripts/./luaGags", "registerLuaGagTriggers");
mockDefaultModule("../../src/scripts/ships", "initShips");
mockDefaultModule("../../src/scripts/transportStops", "initTransportStops");
mockDefaultModule("../../src/scripts/buses", "initBuses");
mockDefaultModule("../../src/scripts/gates", "initGates");
mockDefaultModule("../../src/scripts/seat", "initSeat");
mockDefaultModule("../../src/scripts/attackBeep", "initAttackBeep");
mockDefaultModule("../../src/scripts/attackQueue", "initAttackQueue");
mockDefaultModule("../../src/scripts/lamp", "initLamp");
mockDefaultModule("../../src/scripts/coverTimer", "initCoverTimer");
mockDefaultModule("../../src/scripts/zaskTimer", "initZaskTimer");
mockDefaultModule("../../src/scripts/binds", "initBinds");
mockDefaultModule("../../src/scripts/tempBinds", "initTempBinds");
mockDefaultModule("../../src/scripts/moveMode", "initMoveMode");
mockDefaultModule("../../src/scripts/carriage", "initCarriage");
mockDefaultModule("../../src/scripts/idz", "initIdz");
mockNamedModule("../../src/scripts/kill", "initKillCounter", "initKillCounter", "killCounter");
mockNamedModule("../../src/scripts/improveCounter", "initImproveCounter", "initImproveCounter");
mockDefaultModule("../../src/scripts/escape", "initEscape");
mockNamedModule(
    "../../src/scripts/itemCollector",
    "initItemCollector",
    "initItemCollector",
    { collect: jest.fn() },
);
mockDefaultModule("../../src/scripts/prettyContainers", "initContainers");
mockDefaultModule("../../src/scripts/chatHistory", "initChatHistory");
mockDefaultModule("../../src/scripts/bagManager", "initBagManager");
mockDefaultModule("../../src/scripts/deposits", "initDeposits");
mockDefaultModule("../../src/scripts/herbShop", "initHerbShop");
mockDefaultModule("../../src/scripts/armorShop", "initArmorShop");
mockDefaultModule("../../src/scripts/smith", "initSmith");
mockDefaultModule("../../src/scripts/herbCounter", "initHerbCounter");
mockDefaultModule("../../src/scripts/herbDescriptions", "initHerbDescriptions");
mockDefaultModule("../../src/scripts/lvlCalc", "initLvlCalc");
mockDefaultModule("../../src/scripts/itemCondition", "initItemCondition");
mockDefaultModule("../../src/scripts/durability", "initDurability");
mockDefaultModule("../../src/scripts/wearUsed", "initWearUsed");
mockDefaultModule("../../src/scripts/invite", "initInvite");
mockDefaultModule("../../src/scripts/objectAliases", "initObjectAliases");
mockDefaultModule("../../src/scripts/magicKeys", "initMagicKeys");
mockDefaultModule("../../src/scripts/magics", "initMagics");
mockDefaultModule("../../src/scripts/odlozMagie", "initOdlozMagie");
mockDefaultModule("../../src/scripts/gags", "registerGagTriggers");
mockDefaultModule("../../src/scripts/leaderAttackWarning", "initLeaderAttackWarning");
mockDefaultModule("../../src/scripts/breakItem", "initBreakItem");
mockDefaultModule("../../src/scripts/hpAlert", "initHpAlert");
mockDefaultModule("../../src/scripts/noWeaponAlert", "initNoWeaponAlert");
mockDefaultModule("../../src/scripts/magikZnika", "initMagikZnika");
mockDefaultModule("../../src/scripts/seasonPrint", "initSeasonPrint");
mockDefaultModule("../../src/scripts/worldRebirth", "initWorldRebirth");
mockDefaultModule("../../src/scripts/dajeCiHighlight", "initDajeCiHighlight");
mockDefaultModule("../../src/scripts/przybywajaHighlight", "initPrzybywajaHighlight");
mockDefaultModule("../../src/scripts/przybywajaCount", "initPrzybywajaCount");
mockDefaultModule("../../src/scripts/priceEvaluation", "initPriceEvaluation");
mockDefaultModule("../../src/scripts/stoneValue", "initStoneValue");
mockDefaultModule("../../src/scripts/selfEvaluation", "initSelfEvaluation");
mockDefaultModule("../../src/scripts/skills", "initSkills");
mockDefaultModule("../../src/scripts/coinColors", "initCoinColors");
mockDefaultModule("../../src/scripts/weaponColors", "initWeaponColors");
mockDefaultModule("../../src/scripts/newMail", "initNewMail");
mockDefaultModule("../../src/scripts/externalScripts", "initExternalScripts");
mockDefaultModule("../../src/scripts/userAliases", "initUserAliases");
mockDefaultModule("../../src/scripts/userTriggers", "initUserTriggers");
mockDefaultModule("../../src/scripts/weaponEvaluation", "initWeaponEvaluation");
mockDefaultModule("../../src/scripts/armorEvaluation", "initArmorEvaluation");
mockDefaultModule("../../src/scripts/parryShieldEvaluation", "initParryShieldEvaluation");
mockDefaultModule("../../src/scripts/guildPostfix", "initGuildPostfix");
mockDefaultModule("../../src/scripts/shortExits", "initShortExits");
mockDefaultModule("../../src/scripts/gps", "initGps");
mockDefaultModule("../../src/scripts/localizers", "initLocalizers");
mockDefaultModule("../../src/scripts/shipLocalizers", "initShipLocalizers");
mockDefaultModule("../../src/scripts/mapAliases", "initMapAliases");
mockDefaultModule("../../src/scripts/shortcuts", "initShortcuts");
mockDefaultModule("../../src/scripts/multibinds", "initMultibinds");
mockDefaultModule("../../src/scripts/compareAll", "initCompareAll");
mockDefaultModule("../../src/scripts/followSpecialExits", "initFollowSpecialExits");
mockDefaultModule("../../src/scripts/mountain", "initMountain");
mockDefaultModule("../../src/scripts/language", "initLanguage");
mockDefaultModule("../../src/scripts/idleFullHp", "initIdleFullHp");
mockDefaultModule("../../src/scripts/fullHpTimer", "initFullHpTimer");
mockDefaultModule("../../src/scripts/noExitHighlight", "initNoExitHighlight");
mockDefaultModule("../../src/scripts/letter", "initLetter");
mockDefaultModule("../../src/scripts/teamBlockers", "initTeamBlockers");
mockDefaultModule("../../src/scripts/zaznaczaj", "initZaznaczaj");

const { default: ClientRuntime }: { default: ClientRuntimeConstructor } = require("../../src/runtime/client-runtime");
const { EventHub }: { EventHub: EventHubConstructor } = require("../../src/runtime/event-hub");
const { DefaultDataCatalog }: { DefaultDataCatalog: DefaultDataCatalogConstructor } = require("../../src/runtime/data");
const { registerLegacyModules }: { registerLegacyModules: RegisterLegacyModulesFn } = require("../../src/runtime/modules/legacy-modules");

const settingsService: SettingsService = {
    settings$: {
        subscribe: () => ({ unsubscribe() {} }),
    },
    update: async (_patch: Partial<SettingsSnapshot>) => {},
};

const commandDispatcher: CommandDispatcher = {
    sendCommand: jest.fn(),
    sendEvent: jest.fn(),
    sendExtensionCommand: jest.fn(() => true),
};

describe("ClientRuntime legacy module integration", () => {
    beforeEach(() => {
        moduleCallOrder.length = 0;
        Object.values(moduleMocks).forEach((mock) => mock.mockClear());
    });

    test("initialises modules with provided context", () => {
        const client = {
            aliases: [],
            clientAdapter: {
                output: jest.fn(),
                parseAnsiPatterns: jest.fn((value: string) => value),
                flushMessageBuffer: jest.fn(),
            },
            onLine: jest.fn((text: string) => text),
            Triggers: {
                registerTrigger: jest.fn(),
                registerMultilineTrigger: jest.fn(),
            },
            Map: {
                moveBack: jest.fn(),
                followMove: jest.fn(),
                refresh: jest.fn(),
                refreshPosition: false,
            },
            sendCommand: jest.fn(),
        } as unknown as Client;

        const runtime = new ClientRuntime({
            client,
            eventHub: new EventHub<RuntimeEvents>(),
            settings: settingsService,
            dataCatalog: new DefaultDataCatalog(),
            commands: commandDispatcher,
        });

        registerLegacyModules(runtime);
        runtime.initialise();

        expect(client.aliases).toHaveLength(1);
        expect(client.aliases[0].pattern).toEqual(/\/fake (.*)/);
        expect(moduleMocks.initMapAliases).toHaveBeenCalledWith(client, client.aliases);
        expect(moduleMocks.initShips).toHaveBeenCalledWith(client);
        expect(moduleMocks.initAttackQueue).toHaveBeenCalledWith(client, client.aliases);
        expect(moduleMocks.initItemCollector).toHaveBeenCalledWith(client, client.aliases);
        expect(moduleMocks.initMagicKeys).toHaveBeenCalledWith(client);
        expect(moduleMocks.initLanguage).toHaveBeenCalledWith(client, client.aliases);
        expect(moduleMocks.registerGagTriggers).toHaveBeenCalledWith(client);
        expect(moduleMocks.registerLuaGagTriggers).toHaveBeenCalledWith(client);

        expect(moduleCallOrder[0]).toBe("initMapAliases");
        expect(moduleCallOrder).toEqual(
            expect.arrayContaining([
                "initShips",
                "initItemCollector",
                "initMagicKeys",
                "initCoinColors",
                "People",
                "registerGagTriggers",
            ]),
        );

        expect(client.Triggers.registerTrigger).toHaveBeenCalled();
        expect(client.Triggers.registerMultilineTrigger).toHaveBeenCalledWith(
            [/^Wykonuje komende 'idz /],
            expect.any(Function),
            "follow",
            { stayOpenLines: 1 },
        );
    });
});
