import Client from "../Client";
import { color, RESET, findClosestColor } from "../Colors";
import AnsiString from "../AnsiString";

export default function initDajeCiHighlight(client: Client) {
    const TURQUOISE = findClosestColor("#40e0d0");
    const pattern = /^(?:[ >]*[A-Za-z !()]+ daje ci )(.*)$/;
    client.Triggers.registerTrigger(pattern, (raw, _line, matches, _type, context) => {
        const group = matches[1];
        if (group !== "nowy zapal do walki.") {
            const start = matches.index ?? 0;
            const ctx = context ?? new AnsiString(raw);
            ctx.replacePlainRange(start, start + group.length, color(TURQUOISE) + group + RESET);
            return ctx.getRaw();
        }
    }, "daje-ci-highlight");
}
