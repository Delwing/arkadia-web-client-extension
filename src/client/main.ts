import People from "./People";
import registerLuaGagTriggers from "./scripts/luaGags";
import initPackageHelper from './PackageHelper'
import initInlineCompassRose from './scripts/inlineCompassRose'
import initPausers from './scripts/pausers'

import blockers from './blockers.json'
import initShips from './scripts/ships'
import initTransportStops from './scripts/transportStops'
import initBuses from './scripts/buses'
import initGates from './scripts/gates'
import initSeat from './scripts/seat'
import initAttackBeep from './scripts/attackBeep'
import initAttackQueue from './scripts/attackQueue'
import initLamp from './scripts/lamp'
import initCoverTimer from './scripts/coverTimer'
import initOrderTimer from './scripts/orderTimer'
import initCombatState from './scripts/combatState'
import initCombatTimer from './scripts/combatTimer'
import initZaskTimer from './scripts/zaskTimer'
import initBinds from './scripts/binds'
import initTempBinds from './scripts/tempBinds'
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
import initBagManager from './scripts/bagManager'
import initDeposits from './scripts/deposits'
import initHerbShop from './scripts/herbShop'
import initArmorShop from './scripts/armorShop'
import initSmith from './scripts/smith'
import initHerbCounter from './scripts/herbCounter'
import initHerbDescriptions from './scripts/herbDescriptions'
import initLvlCalc from './scripts/lvlCalc'
import initItemCondition from './scripts/itemCondition'
import initDurability from './scripts/durability'
import initWearUsed from './scripts/wearUsed'
import initInvite from './scripts/invite'
import initObjectAliases from './scripts/objectAliases'
import initMagicKeys from './scripts/magicKeys'
import initMagics from './scripts/magics'
import initMagicSupport from './scripts/magic-support'
import initKnowledge from './scripts/knowledge'
import initOdlozMagie from './scripts/odlozMagie'
import registerGagTriggers from './scripts/gags'
import initLeaderAttackWarning from './scripts/leaderAttackWarning'
import initBreakItem from './scripts/breakItem'
import initHpAlert from './scripts/hpAlert'
import initNoWeaponAlert from './scripts/noWeaponAlert'
import initMagikZnika from './scripts/magikZnika'
import initSeasonPrint from './scripts/seasonPrint'
import initWorldRebirth from './scripts/worldRebirth'
import initDajeCiHighlight from './scripts/dajeCiHighlight'
import initPrzybywajaHighlight from './scripts/przybywajaHighlight'
import initPrzybywajaCount from './scripts/przybywajaCount'
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
import initShipLocalizers from './scripts/shipLocalizers'
import initMapAliases from './scripts/mapAliases'
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
import initNoExitHighlight from './scripts/noExitHighlight'
import initLetter from './scripts/letter'
import initCommandPreserveCaseMode from './scripts/commandPreserveCaseMode'
import initTeamBlockers from './scripts/teamBlockers'
import initZaznaczaj from './scripts/zaznaczaj'
import initTropBind from './scripts/trop'
import Client from "./Client";
import {initSpecialLocations} from "./scripts/specialLocations";
import {emitFakeLine} from "./scripts/fakeLine";
import initKillTracker from "@client/killTracker.ts";
import {initClock} from "@client/scripts/clock.ts";
import initSunCalendarLogger from "@client/scripts/sunCalendarLogger.ts";
import initCutting from './scripts/cutting'
import initWyroznienieOptions from './scripts/wyroznienieOptions'

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
        pattern: /\/fake (.*)/,
        callback: (matches: RegExpMatchArray) => {
            emitFakeLine(client, matches[1])
        }
    })
    initMapAliases(client, aliases)
    initZaznaczaj(client, aliases)

    blockers.forEach(blocker => {
        const blockerPattern = blocker.type === "0" ? blocker.pattern : new RegExp(blocker.pattern)
        client.Triggers.registerTrigger(blockerPattern, (line) => {
            client.Map.moveBack()
            return line
        }, 'blocker')
    })

    initTeamBlockers(client)

    initNoExitHighlight(client)

    client.Triggers.registerTrigger([
        /^.*[pP]odazasz (|skradajac sie )za (.*)\.$/,

    ], (line, matches) => {
        const tokenized = matches[2].split(' ')
        for (let i = 1; i < tokenized.length; i++) {
            const candidate = tokenized[tokenized.length - i]
            const result = client.Map.followMove(candidate, matches[2])
            if (result) {
                return line
            }
        }
        return line
    }, 'follow')

    client.Triggers.registerTrigger(/^Wraz z .* (?:jedziesz|zjezdzasz|wjezdzasz) .* (?:wozem|bryczka|dylizansem) (?:na )?(?<direction>.*?)(?:,.*)?\.$/, (line, matches) => {
        if (matches?.groups?.direction) {
            client.Map.followMove((matches.groups as any).direction)
        }
        return line
    }, 'follow')

    const idzTrigger = client.Triggers.registerTrigger([
        /^Wykonuje komende 'idz /
    ], (line) => {
        return line
    }, 'follow', {stayOpenLines: 1})
    const movePattern = /^Ruszasz (?:niespiesznie|marszem|truchtem|biegiem|szybkim biegiem) na (?<direction>[A-Za-z\-]+)\.$/
    idzTrigger.registerChild(/.*/, (line) => {
        const rawLine = line.text
        const matches = rawLine.match(movePattern)
        if (matches?.groups?.direction) {
            const result = client.Map.followMove(matches.groups.direction)
            if (!result) {
                client.Map.refresh()
            }
            return line
        }
        if (rawLine.startsWith("Wykonuje komende 'idz ")) {
            return line
        }
        if (client.Map.refresh()) {
            return line
        }
        client.Map.refreshPosition = true
        return line
    })

    client.Triggers.registerTrigger(/^Wykonywanie komendy 'idz.*' zostaje przerwane\./, (triggerLine) => {
        client.Map.refreshPosition = false
        return triggerLine
    })

    client.Triggers.registerTrigger('ENTER by przejsc dalej', () => {
        client.sendCommand('')
        return null
    })

    initShips(client)
    initTransportStops(client)
    initBuses(client)
    initGates(client)
    initSeat(client)
    initAttackBeep(client)
    initAttackQueue(client, aliases)
    initLamp(client)
    initCoverTimer(client)
    initOrderTimer(client)
    initCombatState(client)
    initCombatTimer(client)
    initZaskTimer(client)
    initBinds(client, aliases)
    initTempBinds(client, aliases)
    initEnemyBinds(client, aliases)
    initChatHistory(client, aliases)
    initMoveMode(client)
    initCarriage(client)
    initPausers(client)
    initIdz(client, aliases)
    const killCounter = initKillCounter(client, aliases)
    ;(client as any).killCounter = killCounter
    initImproveCounter(client, killCounter, aliases)
    initEscape(client)
    initTracking(client)
    initGps(client)
    initLocalizers(client)
    initShipLocalizers(client)
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
    initLvlCalc(client, aliases)
    initCompareAll(client, aliases)
    initCompareInline(client)
    initPersonDescription(client)
    initItemCondition(client)
    initDurability(client)
    initWearUsed(client)
    initInvite(client)
    initObjectAliases(client, aliases)
    initMagicKeys(client)
    initMagics(client)
    initMagicSupport(client)
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
    initHpAlert(client)
    initIdleFullHp(client)
    initFullHpTimer(client)
    initNoWeaponAlert(client)
    initNewMail(client)
    initMagikZnika(client)
    initSeasonPrint(client)
    initWorldRebirth(client)
    initDajeCiHighlight(client)
    initPrzybywajaHighlight(client)
    initPrzybywajaCount(client)
    initGuildPostfix(client)
    initLanguage(client, aliases)
    initShortcuts(client, aliases)
    initLetter(client, aliases)
    initShortExits(client)
    pluginManager = initExternalScripts(client)
    initUserAliases(client, aliases)
    initUserTriggers(client)
    initWeaponEvaluation(client)
    initArmorEvaluation(client)
    initParryShieldEvaluation(client)
    initSpecialLocations(client)

    new People(client)
    registerGagTriggers(client)
    registerLuaGagTriggers(client)
    initKillTracker(client)
    initPackageHelper(client)
    initInlineCompassRose(client)
    initClock(client)
    initSunCalendarLogger(client)
    initWyroznienieOptions(client)

}
