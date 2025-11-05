import Client from "../Client";
import {colorString} from "@modules/core/Colors";
import {MITHRIL_COLOR, GOLD_COLOR, SILVER_COLOR, COPPER_COLOR} from "./shop";
import {AnsiAwareBuffer} from "../ansi/FormatState";

export function convertCurrency(amount: number): AnsiAwareBuffer {
    const buffer = new AnsiAwareBuffer();
    const values = []
    let rest = amount;
    const mth = Math.floor(rest / 24000);
    rest %= 24000;
    const zl = Math.floor(rest / 240);
    rest %= 240;
    const sr = Math.floor(rest / 12);
    const mdz = rest % 12;
    if (mth > 0) values.push(colorString(`${mth} mth`, MITHRIL_COLOR));
    if (zl > 0) values.push(colorString(`${zl} zl`, GOLD_COLOR));
    if (sr > 0) values.push(colorString(`${sr} sr`, SILVER_COLOR));
    if (mdz > 0) values.push(colorString(`${mdz} mdz`, COPPER_COLOR));
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
    const pattern = /^(?:Wydaje ci sie, ze (?:jest|sa) wart[aye]? okolo|Sa tu \d+ sztuki warte) (([0-9]+) mied[a-z]+\.)$/;
    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches || !matches[2]) return line;
        const amount = parseInt(matches[2], 10);
        return processItemValue(line, amount)
    });
}
