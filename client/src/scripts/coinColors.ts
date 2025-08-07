import Client from "../Client";
import { colorStringInLine } from "../Colors";
import { MITHRIL_COLOR, GOLD_COLOR, SILVER_COLOR, COPPER_COLOR } from "./shop";

export default function initCoinColors(client: Client) {
    const tag = "coinColors";
    const patterns: { regex: RegExp; color: number }[] = [
        { regex: /(\w+\s+)?mithrylow(a|e|ych)(?=.*\bmonet)/i, color: MITHRIL_COLOR },
        { regex: /(\w+\s+)?zlot(a|e|ych)(?=.*\bmonet)/i, color: GOLD_COLOR },
        { regex: /(\w+\s+)?srebrn(a|e|ych)(?=.*\bmonet)/i, color: SILVER_COLOR },
        { regex: /(\w+\s+)?miedzian(a|e|ych)(?=.*\bmonet)/i, color: COPPER_COLOR }
    ];
    patterns.forEach(({ regex, color }) => {
        client.Triggers.registerTrigger(regex, (raw, _line, m) => {
            return colorStringInLine(raw, m[0], color);
        }, tag);
    });
}
