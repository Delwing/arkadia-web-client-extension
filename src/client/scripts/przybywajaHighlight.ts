import Client from "../Client";
import { colorStringInLine, findClosestColor } from "@modules/core/Colors";

export default function initPrzybywajaHighlight(client: Client) {
    const HIGHLIGHT = findClosestColor('#ccb3ff');
    const pattern = /\b(przybyw(?:a|aja))\b/i;
    client.Triggers.registerTrigger(pattern, (triggerLine) => {
        const matches = triggerLine.matches.matches;
        if (!matches || !matches[1]) return triggerLine;
        const start = matches.index ?? 0;
        return colorStringInLine(triggerLine, matches[1], HIGHLIGHT, start);
    }, 'przybywaja-highlight');
}
