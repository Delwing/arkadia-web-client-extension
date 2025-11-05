import Client from "../Client";
import {findClosestColor} from "@modules/core/Colors";

export default function initDajeCiHighlight(client: Client) {
    const TURQUOISE = findClosestColor("#40e0d0");
    const pattern = /^[ >]*[A-Za-z !()]+ daje ci (.*)$/;
    client.Triggers.registerTrigger(pattern, (line, matches) => {
        const group = matches[1];
        if (group !== "nowy zapal do walki.") {
            return line.colorWords(group, TURQUOISE)
        }
        return line;
    }, "daje-ci-highlight");
}
