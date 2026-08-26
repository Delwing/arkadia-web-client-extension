import Client from "../Client";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import { normalizeAttackCommand } from "./attackCommand";
import { normalizeSupportCommand } from "./supportCommand";
import { colorString, createColorFormat } from "@modules/core/Colors";

export type AttackMode = "A" | "AW" | "AWR";

const NO_ENEMIES_COLOR = createColorFormat("#ff6347");

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

    type LocationObject = ReturnType<Client["ObjectManager"]["getObjectsOnLocation"]>[number];

    const attackEach = (
        targets: LocationObject[],
        isAlly: ((id: number) => boolean) | undefined,
        emptyMessage: string
    ) => {
        let attacked = 0;
        for (const t of targets) {
            if (isAlly && isAlly(t.num)) continue;
            client.sendCommand(`${attackCommand} ob_${t.num}`);
            attacked++;
        }

        if (attacked === 0) {
            client.println(colorString(emptyMessage, NO_ENEMIES_COLOR));
        }
    };

    const isNonTeam = (o: LocationObject) =>
        o.__category === 'rest' || o.__category === 'rest-noncombat';

    const attackAllEnemies = (isAlly?: (id: number) => boolean) => {
        const objects = client.ObjectManager.getObjectsOnLocation();

        const teamIds = new Set(
            objects
                .filter(o => o.__category === 'player' || o.__category === 'team')
                .map(o => o.num)
        );

        // Whoever the team is already swinging at.
        const teamTargets = new Set<number>();
        objects.forEach(o => {
            if (!teamIds.has(o.num)) return;
            if (typeof o.attack_num === 'number') {
                teamTargets.add(o.attack_num);
            }
        });

        // An enemy of the team is someone attacking a team member, or someone a
        // team member already attacks. Bystanders (guards, NPCs, passers-by) are
        // left alone.
        const targets = objects.filter(o => {
            if (!isNonTeam(o)) return false;
            if (typeof o.attack_num === 'number' && teamIds.has(o.attack_num)) return true;
            return teamTargets.has(o.num);
        });

        attackEach(targets, isAlly, 'Nie ma wrogow druzyny na lokacji.');
    };

    // Blunt variant: everyone who is not you and not in your team.
    const attackAllNonTeam = (isAlly?: (id: number) => boolean) => {
        const targets = client.ObjectManager.getObjectsOnLocation().filter(isNonTeam);
        attackEach(targets, isAlly, 'Nie ma kogo atakowac.');
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
        attackAllNonTeam,
        support,
        getAttackCommand: () => attackCommand,
        getSupportCommand: () => supportCommand,
    };
}
