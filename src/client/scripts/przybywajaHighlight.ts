import Client from "../Client";
import {findClosestColor} from "@modules/core/Colors";

export default function initPrzybywajaHighlight(client: Client) {
    const HIGHLIGHT = findClosestColor('#ccb3ff');
    const pattern = /\b(przybyw(?:a|aja))\b/i;
    client.Triggers.registerTrigger(pattern, (line, matches) => {
        return line.colorWords(matches[1], HIGHLIGHT)
    }, 'przybywaja-highlight');
}
