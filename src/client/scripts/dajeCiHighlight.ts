import Client from "../Client";
import { colorStringInLine, findClosestColor } from "@modules/core/Colors";

export default function initDajeCiHighlight(client: Client) {
    const TURQUOISE = findClosestColor("#40e0d0");
    const pattern = /^[ >]*[A-Za-z !()]+ daje ci (.*)$/;
    client.Triggers.registerTrigger(pattern, (triggerLine) => {
        const matches = triggerLine.matches.matches;
        if (!matches || !matches[1]) return triggerLine;
        const group = matches[1];
        if (group !== "nowy zapal do walki.") {
            const start = matches.index ?? 0;
            return colorStringInLine(triggerLine, group, TURQUOISE, start);
        }
        return triggerLine;
    }, "daje-ci-highlight");
}
