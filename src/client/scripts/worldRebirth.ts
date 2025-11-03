import Client from "../Client";
import { setItemSync } from "@modules/core/storage";

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
    const ms = new Date(
        Number(m[3]),
        month - 1,
        Number(m[1]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6])
    ).getTime();
    return Math.floor(ms / 1000);
}

export default function initWorldRebirth(client: Client) {
    const tag = "world-rebirth";
    const pattern = /Swiat odrodzil sie\s*:\s*(.+)\s[\s\S]*Ciemnosc\.$/m;
    client.Triggers.registerMultilineTrigger(pattern, (_raw, _line, matches) => {
        const ts = parseRebirthTime(matches[1]);
        if (ts !== undefined) {
            setItemSync("last_world_rebirth", ts);
            client.sendEvent("systemRebirth", ts);
        }
        return undefined;
    }, tag);
}
