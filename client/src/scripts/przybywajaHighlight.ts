import Client from "../Client";
import { color, RESET, findClosestColor } from "../Colors";
import AnsiString from "../AnsiString";

export default function initPrzybywajaHighlight(client: Client) {
    const HIGHLIGHT = findClosestColor('#ccb3ff');
    const pattern = /\b(przybyw(?:a|aja))\b/i;
    client.Triggers.registerTrigger(pattern, (raw, _line, matches, _type, context) => {
        const start = matches.index ?? 0;
        const target = matches[1];
        const ctx = context ?? new AnsiString(raw);
        ctx.replacePlainRange(start, start + target.length, color(HIGHLIGHT) + target + RESET);
        return ctx.getRaw();
    }, 'przybywaja-highlight');
}
