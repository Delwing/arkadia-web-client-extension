import People from "./People";
import eventBus from "@modules/core/eventBus";
import registerLuaGagTriggers from "./scripts/luaGags";
import initPackageHelper from './PackageHelper'
import initInlineCompassRose from './scripts/inlineCompassRose'
import initPausers from './scripts/pausers'
import initTransportTracker from './scripts/transportTracker'
import initGates from './scripts/gates'
import initSeat from './scripts/seat'
import initAttackBeep from './scripts/attackBeep'
import initWarningTriggers from './scripts/warningTriggers'
import initLostTeamMates from './scripts/lostTeamMates'
import initAttackQueue from './scripts/attackQueue'
import initLamp from './scripts/lamp'
import initCoverTimer from './scripts/coverTimer'
import initOrderTimer from './scripts/orderTimer'
import initCombatState from './scripts/combatState'
import initCombatTimer from './scripts/combatTimer'
import initWeaponState from './scripts/weaponState'
import initZaskTimer from './scripts/zaskTimer'
import initWorldDestructionTimer from './scripts/worldDestructionTimer'
import initBinds from './scripts/binds'
import initTempBinds from './scripts/tempBinds'
import initWalkCommands from './scripts/walkCommands'
import initDirectionBinds from './scripts/directionBinds'
import initEnemyBinds from './scripts/enemyBinds'
import initMoveMode from './scripts/moveMode'
import initCarriage from './scripts/carriage'
import initCarriageBlocks from './scripts/carriageBlocks'
import initIdz from './scripts/idz'
import {initKillCounter} from './scripts/kill'
import {initImproveCounter} from './scripts/improveCounter'
import initEscape from './scripts/escape'
import initTracking from './scripts/tracking'
import {initItemCollector} from './scripts/itemCollector'
import initContainers from './scripts/prettyContainers'
import initChatHistory from './scripts/chatHistory'
import initCombatWindow from './scripts/combatWindow'
import initCombatStats from './scripts/combatStats'
import initBagManager from './scripts/bagManager'
import initDeposits from './scripts/deposits'
import initHerbShop from './scripts/herbShop'
import initArmorShop from './scripts/armorShop'
import initSmith from './scripts/smith'
import initHerbCounter from './scripts/herbCounter'
import initHerbDescriptions from './scripts/herbDescriptions'
import initRemedies from './scripts/remedies'
import initLvlCalc from './scripts/lvlCalc'
import initCechyHistory from './scripts/cechyHistory'
import initItemCondition from './scripts/itemCondition'
import initDurability from './scripts/durability'
import initWearUsed from './scripts/wearUsed'
import initAnimalTaming from './scripts/animalTaming'
import initOswajanie from './scripts/oswajanie'
import initInvite from './scripts/invite'
import initObjectAliases from './scripts/objectAliases'
import initMagicKeys from './scripts/magicKeys'
import initMagics from './scripts/magics'
import initMagicSupport from './scripts/magic-support'
import initSpells from './scripts/spells'
import initKnowledge from './scripts/knowledge'
import initOdlozMagie from './scripts/odlozMagie'
import registerGagTriggers from './scripts/gags'
import initLeaderAttackWarning from './scripts/leaderAttackWarning'
import initBreakItem from './scripts/breakItem'
import initPipe from './scripts/pipe'
import initHpAlert from './scripts/hpAlert'
import initNoWeaponAlert from './scripts/noWeaponAlert'
import initMagikZnika from './scripts/magikZnika'
import initSeasonPrint from './scripts/seasonPrint'
import initWorldRebirth from './scripts/worldRebirth'
import initDajeCiHighlight from './scripts/dajeCiHighlight'
import initPrzybywajaCount from './scripts/przybywajaCount'
import initWhoCount from './scripts/whoCount'
import initPriceEvaluation from './scripts/priceEvaluation'
import initStoneValue from './scripts/stoneValue'
import initSelfEvaluation from './scripts/selfEvaluation'
import initSkills from './scripts/skills'
import initLanguageSkills from './scripts/languageSkills'
import initCoinColors from './scripts/coinColors'
import initWeaponColors from './scripts/weaponColors'
import initNewMail from './scripts/newMail'
import initExternalScripts from './scripts/externalScripts'
import initUserAliases from './scripts/userAliases'
import initUserTriggers from './scripts/userTriggers'
import initWeaponEvaluation from './scripts/weaponEvaluation'
import initArmorEvaluation from './scripts/armorEvaluation'
import initParryShieldEvaluation from './scripts/parryShieldEvaluation'
import initGuildPostfix from './scripts/guildPostfix'
import initShortExits from './scripts/shortExits'
import initGps from './scripts/gps'
import initLocalizers from './scripts/localizers'
import initMapAliases from './scripts/mapAliases'
import initRouteInstructions from './scripts/transportLead'
import { registerRoomInfoProvider } from '@modules/core/roomInfoProvider'
import { registerCurrentRoomProvider } from '@modules/core/currentRoomProvider'
import { registerMapDestinationsProvider } from '@modules/core/mapDestinationsProvider'
import { registerTeamStateProvider } from '@modules/core/teamStateProvider'
import initShortcuts from './scripts/shortcuts'
import initMultibinds from './scripts/multibinds'
import initCompareAll from './scripts/compareAll'
import initCompareInline from './scripts/compareInline'
import initPersonDescription from './scripts/personDescription'
import initFollowSpecialExits from './scripts/followSpecialExits'
import initMountain from './scripts/mountain'
import initDrowning from './scripts/drowning'
import initLanguage from './scripts/language'
import initIdleFullHp from './scripts/idleFullHp'
import initFullHpTimer from './scripts/fullHpTimer'
import initTeamPanel from './scripts/teamPanel'
import initNoExitHighlight from './scripts/noExitHighlight'
import initMapCorrections from './scripts/mapCorrections'
import initTideWarningHighlight from './scripts/tideWarningHighlight'
import initLetter from './scripts/letter'
import initCommandPreserveCaseMode from './scripts/commandPreserveCaseMode'
import initTeamBlockers from './scripts/teamBlockers'
import initMove from './scripts/move'
import initDirectionBypass from './scripts/directionBypass'
import initZaznaczaj from './scripts/zaznaczaj'
import initTropBind from './scripts/trop'
import Client from "./Client";
import {initSpecialLocations} from "./scripts/specialLocations";
import {emitFakeLine} from "./scripts/fakeLine";
import initKillTracker from "@client/killTracker.ts";
import {initClock} from "@client/scripts/clock.ts";
import initSunTracker from "@client/scripts/sunTracker.ts";
import initCutting from './scripts/cutting'
import initWyroznienieOptions from './scripts/wyroznienieOptions'
import initContracts from './scripts/contracts'
import initFishing from './scripts/fishing'
import initSpiderWeb from './scripts/spiderWeb'
import initPoczta from './scripts/poczta'
import initLanguageTeacher from './scripts/languageTeacher'
import initProfession from './scripts/profession'
import initIntroduced from './scripts/introduced'
import initAligatorEmoji from './scripts/aligatorEmoji'
import initStaticMapWindow from './scripts/staticMapWindow'
import initAssistant from './scripts/assistant'
import initAttackModeAlias from './scripts/attackModeAlias'
import initDeliveryStats from './scripts/deliveryStats'
import initAfterDeathProgress from './scripts/afterDeathProgress'
import initBrokilon from './scripts/brokilon'
import initTideSystem from './scripts/tideSystem'
import initSoundAliases from './scripts/soundAliases'
import initLootParser from './scripts/lootParser'
import initMessageFlair from './scripts/messageFlair'
import initOstatnio from './scripts/ostatnio'
import initDobOp from './scripts/dobOp'
import initLabyrinth from './scripts/labyrinth'
import initLabyrinthMapper from './scripts/rindeLabyrinthMapper'
import initRaonLabyrinthMapper from './scripts/raonLabyrinthMapper'
import initTaragornLabyrinth from './scripts/taragornLabyrinth'
import initDataRefresh from './scripts/dataRefresh'
import initTcolor from './scripts/tcolor'
import initOpal from './scripts/opal'
import initBagno from './scripts/bagno'
import initWrak from './scripts/wrak'
import initLastSeen from './scripts/lastSeen'
import initZlom from './scripts/zlom'
import initBilety from './scripts/bilety'

// Global reference to PluginManager
let pluginManager: ReturnType<typeof initExternalScripts> | null = null;

/**
 * Get the PluginManager instance
 */
export function getPluginManager() {
    return pluginManager;
}

export function registerScripts(client: Client) {
    const aliases = client.aliases
    aliases.push({
        pattern: /\/fake (?:--type=(\S+) )?(.+)/,
        callback: (matches: RegExpMatchArray) => {
            emitFakeLine(client, matches[2], matches[1] || undefined)
        }
    })
    // Lock / unlock the docked UI (freezes dock resizing, splitting and re-docking
    // and hides docked window controls; floating windows stay interactive). Works
    // in every UI — the active LayoutProvider handles the event. See LayoutState.uiLocked.
    aliases.push({
        pattern: /^\/blokada$/,
        callback: () => eventBus.emit("layout.toggleLock"),
    })
    aliases.push({
        pattern: /^\/reload-plugins$/,
        callback: async () => {
            const manager = getPluginManager();
            if (!manager) {
                client.print('Nie mozna przeladowac pluginow: menedzer nie jest gotowy.');
                return;
            }

            await manager.reloadAll();
            client.print('Przeladowano pluginy.');
        },
    })
    initSoundAliases(client, aliases)
    initMapAliases(client, aliases)
    initRouteInstructions(client)
    initZaznaczaj(client, aliases)

    registerRoomInfoProvider((roomId: number) => {
        const reader = client.Map.tryGetMapReader();
        if (!reader) return null;
        const room = reader.getRoom(roomId);
        if (!room) return null;
        const areaName = room.area !== undefined ? (client.Map.getAreaName(String(room.area)) || '') : '';
        return {
            roomName: room.name || '',
            areaName,
            mapNote: room.userData?.note ?? null,
        };
    })

    registerCurrentRoomProvider(() => client.Map.currentRoom?.id ?? null)

    registerMapDestinationsProvider(() => client.Map.destinations)

    registerTeamStateProvider(() => ({
        isInAnyTeam: !!client.TeamManager?.isInAnyTeam?.(),
        isLeader: !!client.TeamManager?.isLeader?.(),
    }))

    initTeamBlockers(client)
    initMove(client)
    initDirectionBypass(client, aliases)

    initNoExitHighlight(client)
    initMapCorrections(client)
    initTideWarningHighlight(client)

    client.Triggers.registerTrigger('ENTER by przejsc dalej', () => {
        client.sendCommand('')
        return null
    })

    initTransportTracker(client)
    initGates(client)
    initSeat(client)
    initAttackBeep(client)
    initWarningTriggers(client)
    initLostTeamMates(client)
    initAttackQueue(client, aliases)
    initAttackModeAlias(client, aliases)
    initLamp(client)
    initCoverTimer(client)
    initOrderTimer(client)
    initCombatState(client)
    initCombatTimer(client)
    initWeaponState(client)
    initZaskTimer(client)
    initWorldDestructionTimer(client)
    initBinds(client, aliases)
    initTempBinds(client, aliases)
    initWalkCommands(client, aliases)
    initDirectionBinds(client)
    initEnemyBinds(client, aliases)
    initChatHistory(client, aliases)
    initMoveMode(client)
    initCarriage(client, aliases)
    initCarriageBlocks(client, aliases)
    initPausers(client)
    initIdz(client, aliases)
    initKillCounter(client, aliases)
    initImproveCounter(client, aliases)
    initEscape(client)
    initTracking(client)
    initGps(client)
    initLocalizers(client)
    initFollowSpecialExits(client)
    initTropBind(client)
    initMountain(client)
    initDrowning(client)
    initMultibinds(client, aliases)
    initItemCollector(client, aliases);
    initContainers(client)
    initBagManager(client, aliases)
    initCutting(client, aliases)
    initDeposits(client, aliases)
    initHerbShop(client)
    initArmorShop(client)
    initSmith(client, aliases)
    initCommandPreserveCaseMode(client)
    initHerbCounter(client, aliases)
    initHerbDescriptions(client)
    initRemedies(client, aliases)
    initLvlCalc(client, aliases)
    initCechyHistory(client, aliases)
    initCompareAll(client, aliases)
    initCompareInline(client)
    initPersonDescription(client)
    initItemCondition(client)
    initDurability(client)
    initWearUsed(client)
    initAnimalTaming(client)
    initOswajanie(client, aliases)
    initInvite(client)
    initObjectAliases(client, aliases)
    initMagicKeys(client)
    initMagics(client)
    initMagicSupport(client)
    initSpells(client)
    initKnowledge(client, aliases)
    initOdlozMagie(client, aliases)
    initPriceEvaluation(client)
    initStoneValue(client, aliases)
    initSelfEvaluation(client, aliases)
    initSkills(client, aliases)
    initLanguageSkills(client, aliases)
    initCoinColors(client)
    initWeaponColors(client)
    initLeaderAttackWarning(client)
    initBreakItem(client)
    initPipe(client, aliases)
    initHpAlert(client)
    initIdleFullHp(client)
    initFullHpTimer(client)
    initTeamPanel(client)
    initNoWeaponAlert(client)
    initNewMail(client)
    initMagikZnika(client)
    initSeasonPrint(client)
    initWorldRebirth(client)
    initDajeCiHighlight(client)
    initPrzybywajaCount(client)
    initWhoCount(client)
    initGuildPostfix(client)
    initLanguage(client, aliases)
    initShortcuts(client, aliases)
    initLetter(client, aliases)
    initShortExits(client)
    pluginManager = initExternalScripts(client)
    initUserAliases(client, aliases)
    initUserTriggers(client)
    initZlom(client, aliases)
    initWeaponEvaluation(client)
    initArmorEvaluation(client)
    initParryShieldEvaluation(client)
    initSpecialLocations(client)

    new People(client)
    registerGagTriggers(client)
    registerLuaGagTriggers(client)
    initCombatWindow(client, aliases)
    initCombatStats(client, aliases)
    initKillTracker(client)
    initPackageHelper(client)
    initInlineCompassRose(client, aliases)
    initClock(client)
    initSunTracker(client)
    initWyroznienieOptions(client)
    initContracts(client, aliases)
    initFishing(client, aliases)
    initSpiderWeb(client)
    initPoczta(client, aliases)
    initLanguageTeacher(client)
    initProfession(client, aliases)
    initIntroduced(client, aliases)
    initAligatorEmoji(client)
    initStaticMapWindow(client, aliases)
    initAssistant(client, aliases)
    initDeliveryStats(client, aliases)
    initAfterDeathProgress(client)
    initBrokilon(client)
    initTideSystem(client, aliases)
    initLabyrinth(client, aliases)
    initLabyrinthMapper(client, aliases)
    initRaonLabyrinthMapper(client, aliases)
    initTaragornLabyrinth(client)
    initLootParser(client)
    // After lootParser: it rewrites the body/loot lines (colours, click-to-take),
    // and this only tags the result.
    initMessageFlair(client)
    initOstatnio(client, aliases)
    initDobOp(client, aliases)
    initDataRefresh(client, aliases)
    initTcolor(client, aliases)
    initOpal(client)
    initBagno(client)
    initWrak(client)
    initLastSeen(client, aliases)
    initBilety(client, aliases)

}
