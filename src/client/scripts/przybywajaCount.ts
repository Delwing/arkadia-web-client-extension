import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";

export default function initPrzybywajaCount(client: Client) {
    const HIGHLIGHT = createColorFormat('#ccb3ff');
    const pattern = /^[ >]*(.*) ((?:przybyw|podaz)(?:a|aja))\b/;
    client.Triggers.registerTrigger(pattern, (line, matches, type) => {
        if (type !== 'other') return line;
        line = line.colorWords(matches[2], HIGHLIGHT);
        const names = matches[1]
            .split(/,| i /)
            .map(name => name.trim())
            .filter(name => name.length > 0);
        const count = names.length;
        return line.insert(0, `[${count}] `, {})
    }, 'przybywaja-count');
}
