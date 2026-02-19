import Client from "../Client";
import {colorString} from "@modules/core/Colors";
import {MITHRIL_COLOR, GOLD_COLOR, SILVER_COLOR, COPPER_COLOR} from "../constants/colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";

export function splitCurrency(totalCopper: number): { mithril: number; gold: number; silver: number; copper: number } {
    let rest = totalCopper;
    const mithril = Math.floor(rest / 24000);
    rest %= 24000;
    const gold = Math.floor(rest / 240);
    rest %= 240;
    const silver = Math.floor(rest / 12);
    const copper = rest % 12;
    return { mithril, gold, silver, copper };
}

export function convertCurrency(amount: number): AnsiAwareBuffer {
    const buffer = new AnsiAwareBuffer();
    const values = []
    const { mithril, gold, silver, copper } = splitCurrency(amount);
    if (mithril > 0) values.push(colorString(`${mithril} mth`, MITHRIL_COLOR));
    if (gold > 0) values.push(colorString(`${gold} zl`, GOLD_COLOR));
    if (silver > 0) values.push(colorString(`${silver} sr`, SILVER_COLOR));
    if (copper > 0) values.push(colorString(`${copper} mdz`, COPPER_COLOR));
    values.forEach((val, i) => {
        if (i > 0) buffer.append(', ');
        buffer.appendBuffer(val);
    });
    return buffer;
}

export function processItemValue(line: AnsiAwareBuffer, value: number): AnsiAwareBuffer {
    const converted = convertCurrency(value);
    if (!converted) return line;
    return line
        .insert(line.length - 1, ', czyli ')
        .insertBuffer(line.length - 1, converted)
}

export default function initPriceEvaluation(client: Client) {
    const pattern = /^(?:Wydaje ci sie, ze (?:jest|sa) wart[aye]? okolo|Sa tu \d+ sztuki warte|Jest tu \d+ sztuk wartych) (([0-9]+) mied\S+\.)$/;
    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches || !matches[2]) return line;
        const amount = parseInt(matches[2], 10);
        return processItemValue(line, amount)
    });
}
