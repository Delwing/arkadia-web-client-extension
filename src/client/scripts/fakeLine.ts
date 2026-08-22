import Client from "../Client";
import type { AliasList } from "../AliasList";

export function emitFakeLine(client: Client, line: string, type = 'combat.avatar') {
    const processed = client.onLine(line, type)
    processed.forEach(parsed => {
        client.clientAdapter.output(parsed, type)
        client.clientAdapter.emit('output-sent', 1)
    })
}

/**
 * `/fake [--type=<type>] <line>` — push a line through the whole trigger
 * pipeline as if the game had sent it. The workhorse for trying a trigger out
 * without waiting for the situation that produces the line.
 */
export default function initFakeLine(client: Client, aliases: AliasList) {
    aliases.push({
        pattern: /\/fake (?:--type=(\S+) )?(.+)/,
        callback: (matches: RegExpMatchArray) => {
            emitFakeLine(client, matches[2], matches[1] || undefined)
        }
    })
}
