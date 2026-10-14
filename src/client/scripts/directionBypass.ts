import Client from "../Client";
import { longToShort } from "@shared/map/directions";

const dirs = Object.values(longToShort); // n, s, e, w, ne, nw, se, sw, u, d
const bypassPattern = new RegExp(`^(${dirs.join('|')})!$`);

/**
 * The plain direction behind a `<dir>!` bypass command, or null. Labyrinth mappers use it to
 * follow these steps: the alias sends straight to the game, skipping command hooks.
 */
export function parseDirectionBypass(command: string): string | null {
    return command.match(bypassPattern)?.[1] ?? null;
}

/**
 * Registers `<dir>!` aliases (e.g. `n!`, `se!`, `u!`) that bypass map-based
 * movement and move-mode prefixes, sending the plain direction straight to
 * the game. Useful when the map is out of sync or you need a raw step.
 */
export default function initDirectionBypass(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[]
) {
    aliases.push({
        pattern: bypassPattern,
        callback: (matches: RegExpMatchArray) => {
            client.send(matches[1]);
        },
    });
}
