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
import { characterDisabledScripts } from './disabledScripts'
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

// The live registry, so the settings UI can list and toggle what is running.
let scriptRegistry: ScriptRegistry | null = null;

/**
 * The registry for the running client, or null before bootstrap.
 *
 * The toggle list needs to read state and turn scripts on and off, and the
 * registry belongs to the client. Reached the same way `getPluginManager` is,
 * rather than by handing the UI a second source of truth to keep in sync.
 */
export function getScriptRegistry(): ScriptRegistry | null {
    return scriptRegistry;
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
    const registry = new ScriptRegistry(client, characterDisabledScripts)
    scriptRegistry = registry
    const aliases = client.aliases

    // --- The client's own registrations --------------------------------------
    // Not scripts, and never toggleable: they belong to the client the way the
    // triggers in the Client constructor do. Collected here rather than left
    // scattered among the declarations, where their position in the alias list
    // and the trigger fold depended on which script they happened to sit next
    // to. See AGENTS.md, "Where a module belongs".
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

    client.Triggers.registerTrigger('ENTER by przejsc dalej', () => {
        client.sendCommand('')
        return null
    })

    // --- The scripts ---------------------------------------------------------
    registry.declare('fakeLine', initFakeLine)

    registry.declare('soundAliases', initSoundAliases)
    registry.declare('mapAliases', initMapAliases, {requires: ['shortcuts']})
    registry.declare('zaznaczaj', initZaznaczaj)

    registry.declare('allyProtection', initAllyProtection)
    registry.declare('teamBlockers', initTeamBlockers)
    registry.declare('move', initMove)
    registry.declare('directionBypass', initDirectionBypass)

    registry.declare('noExitHighlight', initNoExitHighlight)
    registry.declare('mapCorrections', initMapCorrections)
    registry.declare('tideWarningHighlight', initTideWarningHighlight)

    registry.declare('transportTracker', initTransportTracker)
    registry.declare('gates', initGates)
    registry.declare('seat', initSeat)
    registry.declare('attackBeep', initAttackBeep)
    registry.declare('warningTriggers', initWarningTriggers)
    registry.declare('lostTeamMates', initLostTeamMates)
    registry.declare('attackQueue', initAttackQueue)
    registry.declare('attackModeAlias', initAttackModeAlias)
    registry.declare('lamp', initLamp, {optional: ['bagManager']})
    registry.declare('coverTimer', initCoverTimer)
    registry.declare('orderTimer', initOrderTimer)
    registry.declare('combatState', initCombatState)
    registry.declare('combatTimer', initCombatTimer)
    registry.declare('weaponState', initWeaponState)
    registry.declare('zaskTimer', initZaskTimer)
    registry.declare('worldDestructionTimer', initWorldDestructionTimer)
    registry.declare('binds', initBinds)
    registry.declare('tempBinds', initTempBinds)
    registry.declare('walkCommands', initWalkCommands)
    registry.declare('directionBinds', initDirectionBinds)
    registry.declare('enemyBinds', initEnemyBinds)
    registry.declare('chatHistory', initChatHistory)
    registry.declare('moveMode', initMoveMode)
    registry.declare('carriage', initCarriage)
    registry.declare('pausers', initPausers)
    registry.declare('idz', initIdz, {requires: ['shortcuts']})
    registry.declare('kill', initKillCounter)
    registry.declare('improveCounter', initImproveCounter, {optional: ['kill']})
    registry.declare('escape', initEscape)
    registry.declare('tracking', initTracking)
    registry.declare('gps', initGps)
    registry.declare('localizers', initLocalizers)
    registry.declare('followSpecialExits', initFollowSpecialExits)
    registry.declare('trop', initTropBind)
    registry.declare('mountain', initMountain)
    registry.declare('drowning', initDrowning)
    registry.declare('multibinds', initMultibinds)
    registry.declare('itemCollector', initItemCollector, {optional: ['lootParser', 'bagManager']})
    registry.declare('prettyContainers', initContainers, {optional: ['zlom', 'fishing']})
    registry.declare('bagManager', initBagManager)
    registry.declare('cutting', initCutting, {optional: ['bagManager']})
    registry.declare('deposits', initDeposits, {optional: ['prettyContainers', 'priceEvaluation']})
    registry.declare('herbShop', initHerbShop)
    registry.declare('armorShop', initArmorShop)
    registry.declare('smith', initSmith, {optional: ['bagManager']})
    registry.declare('commandPreserveCaseMode', initCommandPreserveCaseMode)
    registry.declare('herbCounter', initHerbCounter, {optional: ['wearUsed', 'prettyContainers']})
    registry.declare('herbDescriptions', initHerbDescriptions)
    registry.declare('lvlCalc', initLvlCalc)
    registry.declare('cechyHistory', initCechyHistory, {requires: ['lvlCalc'], optional: ['improveCounter']})
    registry.declare('compareAll', initCompareAll)
    registry.declare('compareInline', initCompareInline)
    registry.declare('personDescription', initPersonDescription)
    registry.declare('itemCondition', initItemCondition)
    registry.declare('durability', initDurability)
    registry.declare('wearUsed', initWearUsed)
    registry.declare('animalTaming', initAnimalTaming)
    registry.declare('oswajanie', initOswajanie)
    registry.declare('invite', initInvite)
    registry.declare('objectAliases', initObjectAliases)
    registry.declare('magicKeys', initMagicKeys)
    registry.declare('magics', initMagics)
    registry.declare('magic-support', initMagicSupport)
    registry.declare('spells', initSpells)
    registry.declare('knowledge', initKnowledge)
    registry.declare('odlozMagie', initOdlozMagie)
    registry.declare('priceEvaluation', initPriceEvaluation)
    registry.declare('stoneValue', initStoneValue)
    registry.declare('selfEvaluation', initSelfEvaluation)
    registry.declare('skills', initSkills)
    registry.declare('languageSkills', initLanguageSkills)
    registry.declare('coinColors', initCoinColors)
    registry.declare('weaponColors', initWeaponColors)
    registry.declare('leaderAttackWarning', initLeaderAttackWarning)
    registry.declare('breakItem', initBreakItem)
    registry.declare('pipe', initPipe, {requires: ['herbCounter']})
    registry.declare('hpAlert', initHpAlert)
    registry.declare('idleFullHp', initIdleFullHp)
    registry.declare('fullHpTimer', initFullHpTimer)
    registry.declare('teamPanel', initTeamPanel)
    registry.declare('noWeaponAlert', initNoWeaponAlert)
    registry.declare('newMail', initNewMail)
    registry.declare('magikZnika', initMagikZnika)
    registry.declare('seasonPrint', initSeasonPrint)
    registry.declare('worldRebirth', initWorldRebirth)
    registry.declare('dajeCiHighlight', initDajeCiHighlight)
    registry.declare('przybywajaCount', initPrzybywajaCount)
    registry.declare('whoCount', initWhoCount)
    registry.declare('guildPostfix', initGuildPostfix)
    registry.declare('language', initLanguage)
    registry.declare('shortcuts', initShortcuts)
    registry.declare('letter', initLetter)
    registry.declare('shortExits', initShortExits)
    registry.declare('externalScripts', c => { pluginManager = initExternalScripts(c) })
    registry.declare('userAliases', initUserAliases)
    registry.declare('userTriggers', initUserTriggers)
    registry.declare('zlom', initZlom)
    registry.declare('weaponEvaluation', initWeaponEvaluation)
    registry.declare('armorEvaluation', initArmorEvaluation)
    registry.declare('parryShieldEvaluation', initParryShieldEvaluation)
    registry.declare('specialLocations', initSpecialLocations)

    registry.declare('People', c => { new People(c) })
    registry.declare('gags', registerGagTriggers)
    registry.declare('luaGags', registerLuaGagTriggers, {optional: ['combatStats']})
    // Tees the finished buffer into its own window, so the gags must have had
    // their say: skipDeleted only tells the two apart once they have run.
    registry.declare('combatWindow', initCombatWindow, {after: ['gags', 'luaGags']})
    registry.declare('combatStats', initCombatStats)
    registry.declare('killTracker', initKillTracker, {optional: ['lootParser']})
    registry.declare('PackageHelper', initPackageHelper)
    registry.declare('inlineCompassRose', initInlineCompassRose)
    registry.declare('clock', initClock)
    registry.declare('sunTracker', initSunTracker)
    registry.declare('wyroznienieOptions', initWyroznienieOptions)
    registry.declare('contracts', initContracts)
    registry.declare('fishing', initFishing)
    registry.declare('spiderWeb', initSpiderWeb)
    registry.declare('poczta', initPoczta)
    registry.declare('languageTeacher', initLanguageTeacher)
    registry.declare('profession', initProfession)
    registry.declare('introduced', initIntroduced)
    registry.declare('aligatorEmoji', initAligatorEmoji)
    registry.declare('staticMapWindow', initStaticMapWindow)
    registry.declare('deliveryStats', initDeliveryStats)
    registry.declare('afterDeathProgress', initAfterDeathProgress)
    registry.declare('brokilon', initBrokilon)
    registry.declare('tideSystem', initTideSystem)
    registry.declare('labyrinth', initLabyrinth)
    registry.declare('rindeLabyrinthMapper', initLabyrinthMapper, {requires: ['shortExits']})
    registry.declare('raonLabyrinthMapper', initRaonLabyrinthMapper, {requires: ['shortExits']})
    registry.declare('lootParser', initLootParser, {optional: ['zlom', 'prettyContainers']})
    registry.declare('messageFlair', initMessageFlair)
    registry.declare('ostatnio', initOstatnio)
    registry.declare('dobOp', initDobOp)
    registry.declare('dataRefresh', initDataRefresh)
    registry.declare('tcolor', initTcolor)
    registry.declare('opal', initOpal)
    registry.declare('lastSeen', initLastSeen)
    registry.declare('bilety', initBilety)

    registry.launch()

    return registry
}
