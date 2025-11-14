import Client from "../Client";
import { getItemSync, setItemSync } from "@modules/core/storage";
import { normalizeAttackCommand } from "./attackCommand";

export type AttackMode = "A" | "AW" | "AWR";

export function createAttackController(client: Client) {
    const storedSettings = getItemSync("settings")?.settings;
    let attackCommand = normalizeAttackCommand(storedSettings?.attackCommand);
    client.on("settings", (settings) => {
        const detail = (settings ?? {}) as { attackCommand?: string };
        attackCommand = normalizeAttackCommand(detail?.attackCommand);
    });

    let attackMode: AttackMode = getItemSync("attack_mode")?.attack_mode ?? "A";
    client.on("attackMode", (mode) => {
        attackMode = mode as AttackMode;
        setItemSync("attack_mode", attackMode);
    });
    client.sendEvent("attackMode", attackMode);

    const attackById = (id: number, command: string = attackCommand) => {
        client.sendCommand(`${command} ob_${id}`);
        if (attackMode !== "A" && client.TeamManager.isLeader?.()) {
            client.sendCommand(`wskaz ob_${id} jako cel ataku`, false);
            if (attackMode === "AWR") {
                client.sendCommand(`rozkaz druzynie zaatakowac ob_${id}`, false);
            }
        }
    };

    return {
        attackById,
        getAttackCommand: () => attackCommand,
    };
}
