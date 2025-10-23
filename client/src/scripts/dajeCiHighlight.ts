import Client from "../Client";
import { colorStringInLine, findClosestColor } from "../Colors";

export default function initDajeCiHighlight(client: Client) {
    const TURQUOISE = findClosestColor("#40e0d0");
    const pattern = /^(?:[ >]*[A-Za-z !()]+ daje ci )(.*)$/;
    client.Triggers.registerTrigger(pattern, (raw, _line, matches) => {
        const group = matches[1];
        if (group !== "nowy zapal do walki.") {
            const start = matches.index ?? 0;
            return colorStringInLine(raw, group, TURQUOISE, start, true);
        }
    }, "daje-ci-highlight");
}
