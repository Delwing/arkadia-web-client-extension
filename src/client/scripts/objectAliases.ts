import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {gmcp} from "../gmcp";
import { createAttackController } from "../utils/attackController";
import eventBus from "@modules/core/eventBus";
import initAllyProtection from "./allyProtection";

export default function initObjectAliases(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    function findByShortcut(short: string) {
        const lower = short.toLowerCase();
        return client
            .ObjectManager
            .getObjectsOnLocation()
            .find(o => o.shortcut?.toLowerCase() === lower);
    }

    function exec(short: string, command: string) {
        const obj = findByShortcut(short);
        if (obj) {
            client.sendCommand(`${command} ob_${obj.num}`);
        }
    }

    function shield(short: string) {
        const obj = findByShortcut(short);
        if (obj) {
            const data = client.TeamManager.getAccumulatedObjectsData?.();
            const isTeam = data && data.get(obj.num)?.team;
            const cmd = isTeam ? `zaslon ob_${obj.num}` : `zaslon przed ob_${obj.num}`;
            client.sendCommand(cmd);
            if (releaseGuard) {
                client.releaseGuard();
            }
        }
    }

    function withdraw(short: string) {
        const obj = findByShortcut(short);
        if (obj) {
            client.sendCommand(`gzwycofaj sie za ob_${obj.num}`);
            if (releaseGuard) {
                client.goOutOfGuard();
            }
        }
    }

    function passLeadership(short: string) {
        const obj = findByShortcut(short);
        if (obj) {
            client.sendCommand(`przekaz prowadzenie ob_${obj.num}`);
        }
    }

    function breakDefenseTarget(short?: string) {
        let id: number | string | undefined;
        if (short) {
            const obj = findByShortcut(short);
            id = obj?.num?.toString();
        } else {
            id = client.TeamManager.getAttackTargetId();
        }
        if (id) {
            client.sendCommand("przestan kryc sie za zaslona");
            client.sendCommand(`przelam obrone ob_${id}`);
        }
    }

    const attackController = createAttackController(client);
    const allyProtection = initAllyProtection(client);

    const attackById = (id: number, command?: string) => {
        // Check if target is an ally (cached on first encounter - just a Map lookup)
        if (allyProtection.isAlly(id)) {
            // Check if this is a confirmation (same command repeated within timeout)
            if (allyProtection.checkPendingAttack(id, command)) {
                // Confirmed - allow the attack
                attackController.attackById(id, command);
                return;
            }
            // First attempt - warn and store pending
            const info = allyProtection.getAllyInfo(id);
            allyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
            allyProtection.setPendingAttack(id, command);
            return;
        }
        attackController.attackById(id, command);
    };

    function attack(short: string) {
        const obj = findByShortcut(short);
        if (obj) {
            attackById(obj.num);
        }
    }

    function surprise(short: string) {
        const obj = findByShortcut(short);
        if (obj) {
            attackById(obj.num, "zaskocz");
        }
    }

    let releaseGuard = true;
    const ON_COLOR = createColorFormat("#7cfc00");
    const OFF_COLOR = createColorFormat("#ff6347");
    client.sendEvent('releaseGuard', releaseGuard);
    client.on('releaseGuard', (value) => {
        releaseGuard = value;
    });

    if (aliases) {
        aliases.push({
            pattern: /\/z ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => attack(m[1])
        });
        aliases.push({
            pattern: /\/x ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => surprise(m[1])
        });
        aliases.push({
            pattern: /\/zas ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => shield(m[1])
        });
        aliases.push({
            pattern: /^\/z$/,
            callback: () => {
                const id = client.TeamManager.getAttackTargetId();
                if (id !== undefined) {
                    attackById(id);
                }
            }
        });
        aliases.push({
            pattern: /^\/x$/,
            callback: () => {
                const id = client.TeamManager.getAttackTargetId();
                if (id !== undefined) {
                    attackById(id, "zaskocz");
                }
            }
        });
        aliases.push({
            pattern: /^\/za_id ((?:ob_)?[0-9]+)$/,
            callback: (m: RegExpMatchArray) => {
                const idStr = m[1].replace(/^ob_/, '');
                const id = parseInt(idStr, 10);
                if (!isNaN(id)) {
                    attackById(id);
                }
            }
        });
        aliases.push({
            pattern: /^\/zas$/,
            callback: () => {
                const id = client.TeamManager.getDefenseTargetId();
                if (id !== undefined) {
                    const data = client.TeamManager.getAccumulatedObjectsData?.();
                    const isTeam = data && data.get(id)?.team;
                    const cmd = isTeam ? `zaslon ob_${id}` : `zaslon przed ob_${id}`;
                    client.sendCommand(cmd);
                    if (releaseGuard) {
                        client.releaseGuard();
                    }
                }
            }
        });
        aliases.push({
            pattern: /\/zap ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => exec(m[1], "zapros")
        });
        aliases.push({
            pattern: /\/za ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => shield(m[1])
        });
        aliases.push({
            pattern: /^\/za$/,
            callback: () => {
                const id = client.TeamManager.getDefenseTargetId();
                if (id !== undefined) {
                    const data = client.TeamManager.getAccumulatedObjectsData?.();
                    const isTeam = data && data.get(id)?.team;
                    const cmd = isTeam ? `zaslon ob_${id}` : `zaslon przed ob_${id}`;
                    client.sendCommand(cmd);
                    if (releaseGuard) {
                        client.releaseGuard();
                    }
                }
            }
        });
        aliases.push({
            pattern: /^\/puszczaj$/,
            callback: () => {
                releaseGuard = !releaseGuard;
                const color = releaseGuard ? ON_COLOR : OFF_COLOR;
                const state = releaseGuard ? 'ON' : 'OFF';
                client.print(colorString(`Puszczanie zaslon: ${state}`, color));
                client.sendEvent('releaseGuard', releaseGuard);
            }
        });
        aliases.push({
            pattern: /^\/za([234]) ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => {
                const original = gmcp?.char?.options?.group_cover;
                client.sendGMCP('char.options', {group_cover: parseInt(m[1], 10)});
                shield(m[2]);
                client.sendGMCP('char.options', {group_cover: original});
            }
        });
        aliases.push({
            pattern: /\/w ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => withdraw(m[1])
        });
        aliases.push({
            pattern: /\/pro ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => passLeadership(m[1])
        });
        aliases.push({
            pattern: /\/prze(?: ([A-Za-z0-9@]+))?$/,
            callback: (m?: RegExpMatchArray) => breakDefenseTarget(m?.[1])
        });
        aliases.push({
            pattern: /\/ra ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => exec(m[1], "rozkaz druzynie zaatakowac")
        });
        aliases.push({
            pattern: /^\/ra$/,
            callback: () => {
                const id = client.TeamManager.getAttackTargetId();
                if (id !== undefined) {
                    client.sendCommand(`rozkaz druzynie zaatakowac ob_${id}`);
                }
            }
        });
        aliases.push({
            pattern: /\/rz ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => {
                if (m[1] === '@') {
                    client.sendCommand(`rozkaz druzynie zaslonic siebie`);
                    return;
                }
                const obj = findByShortcut(m[1]);
                if (obj) {
                    client.sendCommand(`rozkaz druzynie zaslonic ob_${obj.num}`);
                }
            }
        });
        aliases.push({
            pattern: /^\/rz$/,
            callback: () => {
                const id = client.TeamManager.getDefenseTargetId();
                if (id !== undefined) {
                    const selfNum = client.ObjectManager.getObjectsOnLocation().find(o => o.shortcut === '@')?.num;
                    if (selfNum !== undefined && id === selfNum) {
                        client.sendCommand(`rozkaz druzynie zaslonic siebie`);
                    } else {
                        client.sendCommand(`rozkaz druzynie zaslonic ob_${id}`);
                    }
                }
            }
        });
        aliases.push({
            pattern: /\/wa ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => {
                const obj = findByShortcut(m[1]);
                if (obj) {
                    client.sendCommand(`wskaz ob_${obj.num} jako cel ataku`);
                }
            }
        });
        aliases.push({
            pattern: /\/wz ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => {
                if (m[1] === '@') {
                    client.sendCommand(`wskaz siebie jako cel obrony`);
                    return;
                }
                const obj = findByShortcut(m[1]);
                if (obj) {
                    client.sendCommand(`wskaz ob_${obj.num} jako cel obrony`);
                }
            }
        });
        aliases.push({
            pattern: /^\/demo_kondycje$/,
            callback: () => eventBus.emit("objectListDemo.popup.open")
        });
    }
}
