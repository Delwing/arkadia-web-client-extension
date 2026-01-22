import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import { getItemSync } from "@modules/core/storage";

const MODES = ["A", "AW", "AWR"] as const;
type AttackMode = (typeof MODES)[number];

const MODE_DESCRIPTIONS: Record<AttackMode, string> = {
    "A": "A (atak)",
    "AW": "AW (atak + wskazanie)",
    "AWR": "AWR (atak + wskazanie + rozkaz)"
};

export default function initAttackModeAlias(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    let currentMode: AttackMode = getItemSync("attack_mode")?.attack_mode ?? "A";

    client.on("attackMode", (mode) => {
        if (MODES.includes(mode as AttackMode)) {
            currentMode = mode as AttackMode;
        }
    });

    aliases.push({
        pattern: /^\/awr$/,
        callback: () => {
            const currentIndex = MODES.indexOf(currentMode);
            const nextMode = MODES[(currentIndex + 1) % MODES.length];
            eventBus.emit("attackMode", nextMode);
            client.println(`Tryb ataku: ${MODE_DESCRIPTIONS[nextMode]}`);
        }
    });
}
