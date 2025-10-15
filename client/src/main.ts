import People from "./People";
import registerLuaGagTriggers from "./scripts/./luaGags";

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
import initZaskTimer from './scripts/zaskTimer'
import initBinds from './scripts/binds'
import initTempBinds from './scripts/tempBinds'
import initMoveMode from './scripts/moveMode'
import initCarriage from './scripts/carriage'
import initIdz from './scripts/idz'
import {initKillCounter} from './scripts/kill'
import {initImproveCounter} from './scripts/improveCounter'
import initEscape from './scripts/escape'
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
import initFollowSpecialExits from './scripts/followSpecialExits'
import initMountain from './scripts/mountain'
import initLanguage from './scripts/language'
import initIdleFullHp from './scripts/idleFullHp'
import initFullHpTimer from './scripts/fullHpTimer'
import initNoExitHighlight from './scripts/noExitHighlight'
import initLetter from './scripts/letter'
import initTeamBlockers from './scripts/teamBlockers'
import initZaznaczaj from './scripts/zaznaczaj'
import Client from "./Client";


export function registerScripts(client: Client) {
    const aliases = client.aliases
    aliases.push({
        pattern: /\/fake (.*)/,
        callback: (matches: RegExpMatchArray) => {
            client.clientAdapter.output(client.clientAdapter.parseAnsiPatterns(client.onLine(matches[1], 'combat.avatar')))
            // @ts-ignore
            client.clientAdapter.flushMessageBuffer() //TODO figure that one
        }
    })
    initMapAliases(client, aliases)
    initZaznaczaj(client, aliases)

    blockers.forEach(blocker => {
        let blockerPattern = blocker.type === "0" ? blocker.pattern : new RegExp(blocker.pattern)
        client.Triggers.registerTrigger(blockerPattern, (): undefined => {
            client.Map.moveBack()
        }, 'blocker')
    })

    initTeamBlockers(client)

    initNoExitHighlight(client)

    client.Triggers.registerTrigger(/^.*[pP]odazasz (|skradajac sie )za (.*)\.$/, (_, __, matches): undefined => {
        const tokenized = matches[2].split(' ')
        const direction = tokenized[tokenized.length - 1]
        client.Map.followMove(direction)
    }, 'follow')

    client.Triggers.registerTrigger(/^Wraz z .* (?:jedziesz|zjezdzasz|wjezdzasz) .* (?:wozem|bryczka|dylizansem) (?:na )?(?<direction>.*?)(?:,.*)?\.$/, (_r, _l, matches: any): undefined => {
        client.Map.followMove(matches.groups.direction)
    }, 'follow')

    const movePattern = /^Ruszasz (?:niespiesznie|marszem|truchtem|biegiem|szybkim biegiem) na (?<direction>[A-Za-z\-]+)\.$/
    client.Triggers.registerMultilineTrigger([
        /^Wykonuje komende 'idz /
    ], (_, line): undefined => {
        const lines = line.split("\n")
        if (lines.length > 1) {
            const matches = lines[1].match(movePattern)
            if (matches?.groups?.direction) {
                client.Map.followMove(matches.groups.direction)
                return
            }
        }
        client.Map.refresh()
        client.Map.refreshPosition = true
    }, 'follow', { stayOpenLines: 1 })

    client.Triggers.registerTrigger(/^Wykonywanie komendy 'idz.*' zostaje przerwane\./, (): undefined => {
        client.Map.refreshPosition = false
    })

    client.Triggers.registerTrigger('ENTER by przejsc dalej', (): string => {
        client.sendCommand('')
        return ""
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
    initZaskTimer(client)
    initBinds(client, aliases)
    initTempBinds(client, aliases)
    initChatHistory(client, aliases)
    initMoveMode(client)
    initCarriage(client)
    initIdz(client, aliases)
    const killCounter = initKillCounter(client, aliases)
    ;(client as any).killCounter = killCounter
    initImproveCounter(client, killCounter, aliases)
    initEscape(client)
    initGps(client)
    initLocalizers(client)
    initShipLocalizers(client)
    initFollowSpecialExits(client)
    initMountain(client)
    initMultibinds(client, aliases)


    const itemCollector = initItemCollector(client, aliases);
    (client as any).ItemCollector = itemCollector;


    initContainers(client)
    initBagManager(client, aliases)
    initDeposits(client, aliases)
    initHerbShop(client)
    initArmorShop(client)
    initSmith(client, aliases)
    initHerbCounter(client, aliases)
    initHerbDescriptions(client)
    initLvlCalc(client, aliases)
    initCompareAll(client, aliases)
    initItemCondition(client)
    initDurability(client)
    initWearUsed(client)
    initInvite(client)
    initObjectAliases(client, aliases)
    initMagicKeys(client)
    initMagics(client)
    initOdlozMagie(client, aliases)
    initPriceEvaluation(client)
    initStoneValue(client, aliases)
    initSelfEvaluation(client, aliases)
    initSkills(client, aliases)
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
    initExternalScripts(client)
    initUserAliases(client, aliases)
    initUserTriggers(client)
    initWeaponEvaluation(client)
    initArmorEvaluation(client)
    initParryShieldEvaluation(client)

    new People(client)
    registerGagTriggers(client)
    registerLuaGagTriggers(client)

}
