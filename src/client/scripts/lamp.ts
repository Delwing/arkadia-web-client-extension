import Client from "../Client";
import {takeFromBag} from "./bagManager";
import {OTHER_OWNER_WORDS_ALT} from "./otherOwner";

// "... lampa wypala sie i gasnie." — your own lamp running out. The same
// room-wide "wypala sie i gasnie." phrasing is used by other items (a pipe) and
// by other characters' lamps, so match the lamp noun positively rather than
// blacklisting everything else, and drop lines naming another owner (see
// otherOwner.ts). An introduced owner appears as a capitalized name after the
// noun, excluded by only allowing lowercase words there; the leading capital is
// optional so a bare "lampa wypala sie i gasnie." still matches.
const LAMP_BURN_OUT = new RegExp(
    `^(?!.*\\b(?:${OTHER_OWNER_WORDS_ALT})\\b)(?:[A-Z][a-z]+(?: [a-z]+)* )?[Ll]amp[a-z]+(?: [a-z]+)* wypala sie i gasnie\\.$`,
);

export default function initLamp(client: Client) {
    const tag = 'lamp'
    const DEFAULT_TIME = 300 // seconds
    const WARNING_TIMES = [120, 60, 30, 10]
    const BEEP_TIMES = [10]

    let seconds = DEFAULT_TIME
    let timer: number | null = null

    function secondsToClock(sec: number) {
        const m = Math.floor(sec / 60)
        const s = sec % 60
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    function processCounter() {
        seconds -= 1
        client.sendEvent('lampTimer', seconds)
        if (WARNING_TIMES.includes(seconds)) {
            client.println(` >> W lampie zostalo oleju na ${secondsToClock(seconds)}.`)
        }
        if (BEEP_TIMES.includes(seconds)) {
            client.sendEvent("sound:category", "lamp")
        }
        if (seconds <= 0) {
            stopTimer()
        }
    }

    function startTimer() {
        stopTimer()
        seconds = DEFAULT_TIME
        timer = window.setInterval(processCounter, 1000)
        processCounter()
    }

    function stopTimer() {
        if (timer != null) {
            clearInterval(timer)
            timer = null
            client.sendEvent('lampTimer', null)
        }
    }

    function resetTimer() {
        seconds = DEFAULT_TIME
    }

    function takeBottle() {
        takeFromBag(client, 'olej')
        client.sendCommand('napelnij lampe olejem')
    }

    function emptyBottle() {
        client.sendCommand('odloz olej')
        takeFromBag(client, 'olej')
        client.sendCommand('napelnij lampe olejem')
    }

    const startPattern = /^[ >]*Zapalasz(?: [a-z ]+)? lampe/
    const offPatterns = [
        /^Gasisz(?: [a-z ]+)? lampe/,
        /nie jest zapalona\.$/,
        /^[ >]*Probujesz zapalic [a-z ]+ jest wyczerpana\.$/,
        LAMP_BURN_OUT,
        /^[ >]*Woda szybko gasi(?: .*)? lampe\.$/
    ]
    const refillPattern = /^[ >]*Dopelniasz(?: [a-z ]+)? [a-z]+ oleju/
    // The vessel noun varies (butelka, butla, flaszeczka, ...) and so
    // does its gender ("pusta" / "pusty"), so match on the oil phrase itself
    // instead of listing every container.
    const emptyPatterns = [
        /oprozniajac zupelnie(?: [a-z ]+)? [a-z]+ oleju\./,
        /\boleju jest pust[ay]\./
    ]
    const noBottlePattern = /^Czym chcesz napelnic(?: [a-z ]+)? lampe/

    client.Triggers.registerTrigger(startPattern, (line) => {
        startTimer()
        return line
    }, tag)

    offPatterns.forEach(pattern => client.Triggers.registerTrigger(pattern, (line) => {
        stopTimer()
        return line
    }, tag))

    client.Triggers.registerTrigger(refillPattern, (line) => {
        resetTimer()
        return line
    }, tag)

    emptyPatterns.forEach(pattern => client.Triggers.registerTrigger(pattern, (line) => {
        client.FunctionalBind.set(' >> Odloz olej, wez butelke do reki i napelnij lampe', emptyBottle)
        return line
    }, tag))

    client.Triggers.registerTrigger(noBottlePattern, (line) => {
        client.FunctionalBind.set(' >> Wez butelke do reki.', takeBottle)
        return line
    }, tag)

    client.aliases.push({
        pattern: /^\/zap$/,
        callback: () => client.sendCommand('zapal lampe')
    })
    client.aliases.push({
        pattern: /^\/zg$/,
        callback: () => client.sendCommand('zgas lampe')
    })
}
