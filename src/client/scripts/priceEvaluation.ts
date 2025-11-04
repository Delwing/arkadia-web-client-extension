import Client from "../Client";
import { colorString } from "@modules/core/Colors";
import { MITHRIL_COLOR, GOLD_COLOR, SILVER_COLOR, COPPER_COLOR } from "./shop";

export function convertCurrency(amount: number): string {
    const parts: string[] = [];
    let rest = amount;
    const mth = Math.floor(rest / 24000);
    rest %= 24000;
    const zl = Math.floor(rest / 240);
    rest %= 240;
    const sr = Math.floor(rest / 12);
    const mdz = rest % 12;
    if (mth > 0) parts.push(colorString(`${mth} mth`, MITHRIL_COLOR));
    if (zl > 0) parts.push(colorString(`${zl} zl`, GOLD_COLOR));
    if (sr > 0) parts.push(colorString(`${sr} sr`, SILVER_COLOR));
    if (mdz > 0) parts.push(colorString(`${mdz} mdz`, COPPER_COLOR));
    return parts.join(', ');
}

export function processItemValue(rawLine: string, value: number): string {
    const converted = convertCurrency(value);
    if (!converted) return rawLine;
    const base = rawLine.replace(/\.$/, '');
    return `${base}, czyli ${converted}.`;
}

export default function initPriceEvaluation(client: Client) {
    const pattern = /^(?:Wydaje ci sie, ze (?:jest|sa) wart[aye]? okolo|Sa tu \d+ sztuki warte) (([0-9]+) mied[a-z]+\.)$/;
    client.Triggers.registerTrigger(pattern, (triggerLine) => {
        const m = triggerLine.matches.matches;
        if (!m || !m[2]) return triggerLine;
        const amount = parseInt(m[2], 10);
        const raw = triggerLine.toAnsiString();
        const result = processItemValue(raw, amount);
        triggerLine.setOverrideAnsi(result);
        return triggerLine;
    });
}
