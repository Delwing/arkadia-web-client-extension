import Client from "../Client";
import { longToShort } from "@shared/map/directions";

/**
 * Registers `<dir>!` aliases (e.g. `n!`, `se!`, `u!`) that bypass map-based
 * movement and move-mode prefixes, sending the plain direction straight to
 * the game. Useful when the map is out of sync or you need a raw step.
 */
export default function initDirectionBypass(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[]
) {
    const dirs = Object.values(longToShort); // n, s, e, w, ne, nw, se, sw, u, d
    aliases.push({
        pattern: new RegExp(`^(${dirs.join('|')})!$`),
        callback: (matches: RegExpMatchArray) => {
            client.send(matches[1]);
        },
    });
}
