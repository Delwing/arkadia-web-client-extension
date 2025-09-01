import Client from "../Client";
import { setItemSync } from "../storage";

function parseRebirthTime(rebirth: string): number | undefined {
    const m = rebirth.match(/\w+, (\d+) ([IVX]+) (\d{4}), (\d+):(\d{2}):(\d{2})/);
    if (!m) {
        return undefined;
    }
    const roman = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
    const month = roman.indexOf(m[2]) + 1;
    if (month <= 0) {
        return undefined;
    }
    return new Date(
        Number(m[3]),
        month - 1,
        Number(m[1]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6])
    ).getTime();
}

export default function initWorldRebirth(client: Client) {
    const tag = "world-rebirth";
    const pattern = /^Swiat odrodzil sie  : (.*)\nCiemnosc\.$/;
    client.Triggers.registerMultilineTrigger(pattern, (_raw, _line, matches) => {
        const ts = parseRebirthTime(matches[1]);
        if (ts) {
            setItemSync("last_world_rebirth", ts);
        }
        return undefined;
    }, tag);
}
