import Client from "../Client";
import {takeFromBag} from "./bagManager";

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
        /(?<!fajka) wypala sie i gasnie\.$/,
        /^[ >]*Woda szybko gasi(?: .*)? lampe\.$/
    ]
    const refillPattern = /^[ >]*Dopelniasz(?: [a-z ]+)? [a-z]+ oleju/
    const emptyPatterns = [
        /oprozniajac zupelnie(?: [a-z ]+)? [a-z]+ oleju\./,
        /utelka oleju jest pusta\./,
        /utla oleju jest pusta\./
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
