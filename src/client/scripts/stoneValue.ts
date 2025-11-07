import Client from "../Client";
import { convertCurrency, processItemValue } from "./priceEvaluation";
import {AnsiAwareBuffer} from "../ansi/FormatState";

export default function initStoneValue(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "stone-value";
    const pattern = /^(?:Wydaje ci sie, ze (?:jest|sa) wart[aye]? okolo|Sa tu \d+ sztuki warte) ([0-9]+) mied[a-z]+/;

    let sum = 0;

    function run() {
        sum = 0;
        client.Triggers.registerTrigger(pattern, (line, matches) => {
            if (!matches || !matches[1]) return line;
            const amount = parseInt(matches[1], 10);
            sum += amount;
            const raw = line.text;
            const result = processItemValue(raw, amount);
            return new AnsiAwareBuffer(result);
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

