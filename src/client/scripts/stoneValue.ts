import Client from "../Client";
import { convertCurrency, processItemValue } from "./priceEvaluation";

export default function initStoneValue(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "stone-value";
    const pattern = /^(?:Wydaje ci sie, ze (?:jest|sa) wart[aye]? okolo|Sa tu \d+ sztuki warte) ([0-9]+) mied[a-z]+/;

    let sum = 0;

    function run() {
        sum = 0;
        client.Triggers.registerTrigger(pattern, (triggerLine) => {
            const m = triggerLine.matches.matches;
            if (!m || !m[1]) return triggerLine;
            const amount = parseInt(m[1], 10);
            sum += amount;
            const raw = triggerLine.toAnsiString();
            const result = processItemValue(raw, amount);
            triggerLine.setOverrideAnsi(result);
            return triggerLine;
        }, tag);
        client.sendCommand("ocen kamienie");
        setTimeout(() => {
            client.Triggers.removeByTag(tag);
            if (sum > 0) {
                client.println(`Laczna wartosc kamieni: ${convertCurrency(sum)}`);
            }
        }, 700);
    }

    if (aliases) {
        aliases.push({ pattern: /^\/ocenkamienie$/, callback: run });
    }
}

