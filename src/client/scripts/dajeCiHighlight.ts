import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";

export default function initDajeCiHighlight(client: Client) {
    const TURQUOISE = createColorFormat("#40e0d0");
    const pattern = /^[ >]*[A-Za-z !()]+ daje ci (.*)$/;
    client.Triggers.registerTrigger(pattern, (line, matches) => {
        const group = matches[1];
        if (group !== "nowy zapal do walki." && group.startsWith("sie ")) {
            return line.colorWords(group, TURQUOISE)
        }
        return line;
    }, "daje-ci-highlight");
}
