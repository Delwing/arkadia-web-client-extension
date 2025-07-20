import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

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
            if (releaseGuard) {
                client.sendCommand("przestan zaslaniac");
            }
            const data = client.TeamManager.getAccumulatedObjectsData?.();
            const isTeam = data && data[obj.num]?.team;
            const cmd = isTeam ? `zaslon ob_${obj.num}` : `zaslon przed ob_${obj.num}`;
            client.sendCommand(cmd);
        }
    }
    let releaseGuard = false;
    const ON_COLOR = findClosestColor("#7cfc00");
    const OFF_COLOR = findClosestColor("#ff6347");


    if (aliases) {
        aliases.push({
            pattern: /\/z ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => exec(m[1], "zabij")
        });
        aliases.push({
            pattern: /\/zas ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => shield(m[1])
        });
        aliases.push({
            pattern: /^\/z$/,
            callback: () => {
                const id = client.TeamManager.getAttackTargetId();
                if (id) {
                    client.sendCommand(`zabij ob_${id}`);
                }
            }
        });
        aliases.push({
            pattern: /^\/zas$/,
            callback: () => {
                const id = client.TeamManager.getDefenseTargetId();
                if (id) {
                    if (releaseGuard) {
                        client.sendCommand("przestan zaslaniac");
                    }
                    const data = client.TeamManager.getAccumulatedObjectsData?.();
                    const isTeam = data && data[id]?.team;
                    const cmd = isTeam ? `zaslon ob_${id}` : `zaslon przed ob_${id}`;
                    client.sendCommand(cmd);
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
                if (id) {
                    if (releaseGuard) {
                        client.sendCommand("przestan zaslaniac");
                    }
                    const data = client.TeamManager.getAccumulatedObjectsData?.();
                    const isTeam = data && data[id]?.team;
                    const cmd = isTeam ? `zaslon ob_${id}` : `zaslon przed ob_${id}`;
                    client.sendCommand(cmd);
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
            }
        });
    }
}
