import Client from "../Client";
import { isPolishDirection } from "@shared/map/directions";

// The compass step may be followed by terrain flavour: "za Chorem na zachod, brodzac w wodzie
// morskiej", "..., wchodzac na plycizne", "..., wychodzac na brzeg".
const followDirectionPattern = / na ([a-z]+(?:-[a-z]+)?)(?=,|$)/g;

export function extractFollowDirection(followText: string): string | undefined {
    for (const match of followText.matchAll(followDirectionPattern)) {
        if (isPolishDirection(match[1])) {
            return match[1];
        }
    }
    return undefined;
}

export default function initMove(client: Client) {
    const tag = 'follow';

    client.Triggers.registerTrigger([
        /^.*[pP]odazasz (|skradajac sie )za (.*)\.$/,
    ], (line, matches) => {
        // A named compass direction fully determines the step, so follow it once and stop —
        // probing the trailing flavour words as exits would only mismatch or flag us as lost.
        const direction = extractFollowDirection(matches[2])
        if (direction) {
            client.Map.followMove(direction, matches[2])
            return line
        }
        const tokenized = matches[2].split(' ')
        for (let i = 1; i < tokenized.length; i++) {
            const candidate = tokenized[tokenized.length - i]
            const result = client.Map.followMove(candidate, matches[2])
            if (result) {
                return line
            }
        }
        return line
    }, tag)

    client.Triggers.registerTrigger(/^Wraz z .* (?:jedziesz|zjezdzasz|wjezdzasz) .* (?:wozem|bryczka|dylizansem) (?:na )?(?<direction>.*?)(?:,.*)?\.$/, (line, matches) => {
        if (matches?.groups?.direction) {
            client.Map.followMove((matches.groups as any).direction)
        }
        return line
    }, tag)

    client.Triggers.registerTrigger(/^Skryty za .* zaczynasz plynac na (?<direction>\w+)\.$/, (line, matches) => {
        if (matches?.groups?.direction) {
            client.Map.followMove((matches.groups as any).direction)
        }
        return line
    }, tag)

    client.Triggers.registerTrigger(/^Wraz z .* pomagacie .* przeniesc .* (?:na|do) (?<direction>.*)\.$/, (line, matches) => {
        if (matches?.groups?.direction) {
            client.Map.followMove((matches.groups as any).direction)
        }
        return line
    }, tag)

    client.Triggers.registerTrigger(/^Pomagasz .* przeniesc .* (?:na|do) (?<direction>.*)\.$/, (line, matches) => {
        if (matches?.groups?.direction) {
            client.Map.followMove((matches.groups as any).direction)
        }
        return line
    }, tag)

    client.Triggers.registerTrigger(/^.* kieruje lodz na (?<direction>.*)\.$/, (line, matches) => {
        if (matches?.groups?.direction) {
            client.Map.followMove((matches.groups as any).direction)
        }
        return line
    }, tag)

    const idzTrigger = client.Triggers.registerTrigger([
        /^Wykonuje komende 'idz /
    ], (line) => {
        return line
    }, tag, {stayOpenLines: 1})

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
}
