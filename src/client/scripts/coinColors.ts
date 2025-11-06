import Client from "../Client";
import {colorStringInLine} from "@modules/core/Colors";
import {COPPER_COLOR, GOLD_COLOR, MITHRIL_COLOR, SILVER_COLOR} from "../constants/colors";
import {FormatStateSnapshot} from "@client/ansi/FormatState.ts";

export default function initCoinColors(client: Client) {
    const tag = "coinColors";
    const patterns: { regex: RegExp; color: FormatStateSnapshot }[] = [
        {regex: /(\w+\s+)?mithrylow(a|e|ych)(?=.*\bmonet)/i, color: MITHRIL_COLOR},
        {regex: /(\w+\s+)?zlot(a|e|ych)(?=.*\bmonet)/i, color: GOLD_COLOR},
        {regex: /(\w+\s+)?srebrn(a|e|ych)(?=.*\bmonet)/i, color: SILVER_COLOR},
        {regex: /(\w+\s+)?miedzian(a|e|ych)(?=.*\bmonet)/i, color: COPPER_COLOR}
    ];
    patterns.forEach(({regex, color}) => {
        client.Triggers.registerTrigger(regex, (line, matches) => {
            return colorStringInLine(line, matches[0], color);
        }, tag);
    });
}
