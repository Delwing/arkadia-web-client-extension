import Client from "../Client";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import { normalizeAttackCommand } from "./attackCommand";
import { normalizeSupportCommand } from "./supportCommand";

export type AttackMode = "A" | "AW" | "AWR";

export function createAttackController(client: Client) {
    const storedSettings = characterStorage.get("settings");
    let attackCommand = normalizeAttackCommand(storedSettings?.attackCommand);
    let supportCommand = normalizeSupportCommand(storedSettings?.supportCommand);
    characterStorage.onChange("settings", (settings) => {
        const detail = (settings ?? defaultSettings) as { attackCommand?: string; supportCommand?: string };
        attackCommand = normalizeAttackCommand(detail?.attackCommand);
        supportCommand = normalizeSupportCommand(detail?.supportCommand);
    });

    let attackMode: AttackMode = characterStorage.get("attack_mode") ?? "A";
    client.on("attackMode", (mode) => {
        attackMode = mode as AttackMode;
        characterStorage.set("attack_mode", attackMode);
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

    const support = (command: string = supportCommand) => {
        client.sendCommand(command);
        const id = client.TeamManager.getLeaderId?.();
        if (id) {
            client.sendCommand(`${command} ob_${id}`);
        }
    };

    return {
        attackById,
        support,
        getAttackCommand: () => attackCommand,
        getSupportCommand: () => supportCommand,
    };
}
