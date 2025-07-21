import Client from "../Client";
import { convertCurrency, processItemValue } from "./priceEvaluation";

export default function initStoneValue(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "stone-value";
    const pattern = /^Wydaje ci sie, ze (jest|sa) wart[aye]? okolo (([0-9]+) mied[a-z]+\.)$/;

    let sum = 0;

    function run() {
        sum = 0;
        client.Triggers.registerTrigger(pattern, (raw, _line, m) => {
            const amount = parseInt(m[3], 10);
            sum += amount;
            return processItemValue(raw, amount);
        }, tag);
        client.sendCommand("ocen kamienie");
        setTimeout(() => {
            client.Triggers.removeByTag(tag);
            if (sum > 0) {
                client.print(`Laczna wartosc kamieni: ${convertCurrency(sum)}`);
            }
        }, 700);
    }

    if (aliases) {
        aliases.push({ pattern: /^\/ocenkamienie$/, callback: run });
    }
}

