import Client from "../Client";
import { polishWordToNumber, polishNumberPattern } from "./polishNumberConverter";

export default function initWhoCount(client: Client) {
    let lastCount: number | null = null;

    const numberGroup = `(${polishNumberPattern}|\\d+)`;
    const pattern = new RegExp(
        `^Sposrod\\s+${numberGroup}\\s+osob przebywajacych obecnie w swiecie Arkadii, znane tobie to:`
    );

    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches) return line;

        const count = polishWordToNumber(matches[1]);
        if (count === 0) return line;

        let suffix = '';
        if (lastCount !== null) {
            const diff = count - lastCount;
            if (diff > 0) {
                suffix = ` [+${diff}]`;
            } else if (diff < 0) {
                suffix = ` [${diff}]`;
            } else {
                suffix = ` [=]`;
            }
        }
        lastCount = count;

        if (suffix) {
            const text = line.text;
            const colonIndex = text.indexOf(':');
            if (colonIndex >= 0) {
                line = line.insert(colonIndex + 1, suffix, {});
            }
        }

        return line;
    }, 'who-count');
}
