import Client from "../Client";
import { takeFromBag } from "./bagManager";

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
            client.sendEvent("sound:play", { key: "beep" })
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
        /^Woda szybko gasi .* lampe\.$/
    ]
    const refillPattern = /^[ >]*Dopelniasz(?: [a-z ]+)? [a-z]+ oleju/
    const emptyPatterns = [
        /oprozniajac zupelnie(?: [a-z ]+)? [a-z]+ oleju\./,
        /utelka oleju jest pusta\./,
        /utla oleju jest pusta\./
    ]
    const noBottlePattern = /^Czym chcesz napelnic(?: [a-z ]+)? lampe/

    client.Triggers.registerTrigger(startPattern, () => {
        startTimer()
        return undefined
    }, tag)

    offPatterns.forEach(p => client.Triggers.registerTrigger(p, () => {
        stopTimer()
        return undefined
    }, tag))

    client.Triggers.registerTrigger(refillPattern, () => {
        resetTimer()
        return undefined
    }, tag)

    emptyPatterns.forEach(p => client.Triggers.registerTrigger(p, () => {
        client.FunctionalBind.set(' >> Odloz olej, wez butelke do reki i napelnij lampe', emptyBottle)
        return undefined
    }, tag))

    client.Triggers.registerTrigger(noBottlePattern, () => {
        client.FunctionalBind.set(' >> Wez butelke do reki.', takeBottle)
        return undefined
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
