import People from "./scripts/People";
import eventBus from "@modules/core/eventBus";
import registerLuaGagTriggers from "./scripts/luaGags";
import initPackageHelper from './scripts/PackageHelper'
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
import initAllyProtection from './scripts/allyProtection'
import Client from "./Client";
import {ScriptRegistry} from "./ScriptRegistry";
import {initSpecialLocations} from "./scripts/specialLocations";
import initFakeLine from "./scripts/fakeLine";
import initKillTracker from "@client/scripts/killTracker.ts";
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
import initDataRefresh from './scripts/dataRefresh'
import initTcolor from './scripts/tcolor'
import initOpal from './scripts/opal'
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

/**
 * Start every script, each inside its own scope so it can be stopped again.
 *
 * The written order here is the registration order, and it matters: aliases match
 * in push order, triggers run in registration order. Registry ids are the module
 * names under `scripts/` — the invariant that every module appears here exactly
 * once is asserted in test/client/ScriptRegistry.test.ts.
 *
 * A handful of things stay outside the registry because they are not scripts: the
 * map/team providers the UI reads through, the docked-layout lock, the plugin
 * reload alias, and the pager's ENTER auto-continue. Those belong to the client.
 */
export function registerScripts(client: Client): ScriptRegistry {
    const registry = new ScriptRegistry(client)
    const aliases = client.aliases

    registry.start('fakeLine', initFakeLine)
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
    registry.start('soundAliases', initSoundAliases)
    registry.start('mapAliases', initMapAliases)
    registry.start('zaznaczaj', initZaznaczaj)

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

    registry.start('allyProtection', initAllyProtection)
    registry.start('teamBlockers', initTeamBlockers)
    registry.start('move', initMove)
    registry.start('directionBypass', initDirectionBypass)

    registry.start('noExitHighlight', initNoExitHighlight)
    registry.start('mapCorrections', initMapCorrections)
    registry.start('tideWarningHighlight', initTideWarningHighlight)

    client.Triggers.registerTrigger('ENTER by przejsc dalej', () => {
        client.sendCommand('')
        return null
    })

    registry.start('transportTracker', initTransportTracker)
    registry.start('gates', initGates)
    registry.start('seat', initSeat)
    registry.start('attackBeep', initAttackBeep)
    registry.start('warningTriggers', initWarningTriggers)
    registry.start('lostTeamMates', initLostTeamMates)
    registry.start('attackQueue', initAttackQueue)
    registry.start('attackModeAlias', initAttackModeAlias)
    registry.start('lamp', initLamp)
    registry.start('coverTimer', initCoverTimer)
    registry.start('orderTimer', initOrderTimer)
    registry.start('combatState', initCombatState)
    registry.start('combatTimer', initCombatTimer)
    registry.start('weaponState', initWeaponState)
    registry.start('zaskTimer', initZaskTimer)
    registry.start('worldDestructionTimer', initWorldDestructionTimer)
    registry.start('binds', initBinds)
    registry.start('tempBinds', initTempBinds)
    registry.start('walkCommands', initWalkCommands)
    registry.start('directionBinds', initDirectionBinds)
    registry.start('enemyBinds', initEnemyBinds)
    registry.start('chatHistory', initChatHistory)
    registry.start('moveMode', initMoveMode)
    registry.start('carriage', initCarriage)
    registry.start('pausers', initPausers)
    registry.start('idz', initIdz)
    registry.start('kill', initKillCounter)
    registry.start('improveCounter', initImproveCounter)
    registry.start('escape', initEscape)
    registry.start('tracking', initTracking)
    registry.start('gps', initGps)
    registry.start('localizers', initLocalizers)
    registry.start('followSpecialExits', initFollowSpecialExits)
    registry.start('trop', initTropBind)
    registry.start('mountain', initMountain)
    registry.start('drowning', initDrowning)
    registry.start('multibinds', initMultibinds)
    registry.start('itemCollector', initItemCollector)
    registry.start('prettyContainers', initContainers)
    registry.start('bagManager', initBagManager)
    registry.start('cutting', initCutting)
    registry.start('deposits', initDeposits)
    registry.start('herbShop', initHerbShop)
    registry.start('armorShop', initArmorShop)
    registry.start('smith', initSmith)
    registry.start('commandPreserveCaseMode', initCommandPreserveCaseMode)
    registry.start('herbCounter', initHerbCounter)
    registry.start('herbDescriptions', initHerbDescriptions)
    registry.start('lvlCalc', initLvlCalc)
    registry.start('cechyHistory', initCechyHistory)
    registry.start('compareAll', initCompareAll)
    registry.start('compareInline', initCompareInline)
    registry.start('personDescription', initPersonDescription)
    registry.start('itemCondition', initItemCondition)
    registry.start('durability', initDurability)
    registry.start('wearUsed', initWearUsed)
    registry.start('animalTaming', initAnimalTaming)
    registry.start('oswajanie', initOswajanie)
    registry.start('invite', initInvite)
    registry.start('objectAliases', initObjectAliases)
    registry.start('magicKeys', initMagicKeys)
    registry.start('magics', initMagics)
    registry.start('magic-support', initMagicSupport)
    registry.start('spells', initSpells)
    registry.start('knowledge', initKnowledge)
    registry.start('odlozMagie', initOdlozMagie)
    registry.start('priceEvaluation', initPriceEvaluation)
    registry.start('stoneValue', initStoneValue)
    registry.start('selfEvaluation', initSelfEvaluation)
    registry.start('skills', initSkills)
    registry.start('languageSkills', initLanguageSkills)
    registry.start('coinColors', initCoinColors)
    registry.start('weaponColors', initWeaponColors)
    registry.start('leaderAttackWarning', initLeaderAttackWarning)
    registry.start('breakItem', initBreakItem)
    registry.start('pipe', initPipe)
    registry.start('hpAlert', initHpAlert)
    registry.start('idleFullHp', initIdleFullHp)
    registry.start('fullHpTimer', initFullHpTimer)
    registry.start('teamPanel', initTeamPanel)
    registry.start('noWeaponAlert', initNoWeaponAlert)
    registry.start('newMail', initNewMail)
    registry.start('magikZnika', initMagikZnika)
    registry.start('seasonPrint', initSeasonPrint)
    registry.start('worldRebirth', initWorldRebirth)
    registry.start('dajeCiHighlight', initDajeCiHighlight)
    registry.start('przybywajaCount', initPrzybywajaCount)
    registry.start('whoCount', initWhoCount)
    registry.start('guildPostfix', initGuildPostfix)
    registry.start('language', initLanguage)
    registry.start('shortcuts', initShortcuts)
    registry.start('letter', initLetter)
    registry.start('shortExits', initShortExits)
    registry.start('externalScripts', c => { pluginManager = initExternalScripts(c) })
    registry.start('userAliases', initUserAliases)
    registry.start('userTriggers', initUserTriggers)
    registry.start('zlom', initZlom)
    registry.start('weaponEvaluation', initWeaponEvaluation)
    registry.start('armorEvaluation', initArmorEvaluation)
    registry.start('parryShieldEvaluation', initParryShieldEvaluation)
    registry.start('specialLocations', initSpecialLocations)

    registry.start('People', c => { new People(c) })
    registry.start('gags', registerGagTriggers)
    registry.start('luaGags', registerLuaGagTriggers)
    registry.start('combatWindow', initCombatWindow)
    registry.start('combatStats', initCombatStats)
    registry.start('killTracker', initKillTracker)
    registry.start('PackageHelper', initPackageHelper)
    registry.start('inlineCompassRose', initInlineCompassRose)
    registry.start('clock', initClock)
    registry.start('sunTracker', initSunTracker)
    registry.start('wyroznienieOptions', initWyroznienieOptions)
    registry.start('contracts', initContracts)
    registry.start('fishing', initFishing)
    registry.start('spiderWeb', initSpiderWeb)
    registry.start('poczta', initPoczta)
    registry.start('languageTeacher', initLanguageTeacher)
    registry.start('profession', initProfession)
    registry.start('introduced', initIntroduced)
    registry.start('aligatorEmoji', initAligatorEmoji)
    registry.start('staticMapWindow', initStaticMapWindow)
    registry.start('deliveryStats', initDeliveryStats)
    registry.start('afterDeathProgress', initAfterDeathProgress)
    registry.start('brokilon', initBrokilon)
    registry.start('tideSystem', initTideSystem)
    registry.start('labyrinth', initLabyrinth)
    registry.start('rindeLabyrinthMapper', initLabyrinthMapper)
    registry.start('raonLabyrinthMapper', initRaonLabyrinthMapper)
    registry.start('lootParser', initLootParser)
    // After lootParser: it rewrites the body/loot lines (colours, click-to-take),
    // and this only tags the result.
    registry.start('messageFlair', initMessageFlair)
    registry.start('ostatnio', initOstatnio)
    registry.start('dobOp', initDobOp)
    registry.start('dataRefresh', initDataRefresh)
    registry.start('tcolor', initTcolor)
    registry.start('opal', initOpal)
    registry.start('lastSeen', initLastSeen)
    registry.start('bilety', initBilety)

    return registry
}
