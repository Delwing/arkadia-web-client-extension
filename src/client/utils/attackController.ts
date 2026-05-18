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
        const m = mode as AttackMode;
        if (m === attackMode) return;
        attackMode = m;
        characterStorage.set("attack_mode", attackMode);
    });
    characterStorage.onChange("attack_mode", (mode) => {
        const m = mode ?? "A";
        if (m === attackMode) return;
        attackMode = m;
        client.sendEvent("attackMode", attackMode);
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

    const attackByTarget = (target: string, command: string = attackCommand) => {
        client.sendCommand(`${command} ${target}`);
        if (attackMode !== "A" && client.TeamManager.isLeader?.()) {
            client.sendCommand(`wskaz ${target} jako cel ataku`, false);
            if (attackMode === "AWR") {
                client.sendCommand(`rozkaz druzynie zaatakowac ${target}`, false);
            }
        }
    };

    const attackAllEnemies = (isAlly?: (id: number) => boolean) => {
        const objects = client.ObjectManager.getObjectsOnLocation();
        const targets = objects.filter(o =>
            o.__category === 'rest' || o.__category === 'rest-noncombat'
        );
        for (const t of targets) {
            if (isAlly && isAlly(t.num)) continue;
            client.sendCommand(`${attackCommand} ob_${t.num}`);
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
        attackByTarget,
        attackAllEnemies,
        support,
        getAttackCommand: () => attackCommand,
        getSupportCommand: () => supportCommand,
    };
}
