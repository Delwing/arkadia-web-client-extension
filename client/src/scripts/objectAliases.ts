import Client from "../Client";
import {colorString, findClosestColor} from "../Colors";
import {gmcp} from "../gmcp";

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
            const isTeam = data && data[obj.num]?.team;
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
        let id: string | undefined;
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

    function attackById(id: string) {
        client.sendCommand(`zabij ob_${id}`);
        if (attackMode !== 'A') {
            client.sendCommand(`wskaz ob_${id} jako cel ataku`);
            if (attackMode === 'AWR') {
                client.sendCommand('rozkaz zaatakowac');
            }
        }
    }

    function attack(short: string) {
        const obj = findByShortcut(short);
        if (obj) {
            attackById(obj.num.toString());
        }
    }

    let releaseGuard = true;
    const ON_COLOR = findClosestColor("#7cfc00");
    const OFF_COLOR = findClosestColor("#ff6347");
    client.sendEvent('releaseGuard', releaseGuard);
    client.addEventListener('releaseGuard', (event: CustomEvent<boolean>) => {
        releaseGuard = event.detail;
    });

    let attackMode: 'A' | 'AW' | 'AWR' = 'A';
    client.sendEvent('attackMode', attackMode);
    client.addEventListener('attackMode', (event: CustomEvent<'A' | 'AW' | 'AWR'>) => {
        attackMode = event.detail;
    });


    if (aliases) {
        aliases.push({
            pattern: /\/z ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => attack(m[1])
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
                    attackById(id);
                }
            }
        });
        aliases.push({
            pattern: /^\/zas$/,
            callback: () => {
                const id = client.TeamManager.getDefenseTargetId();
                if (id) {
                    const data = client.TeamManager.getAccumulatedObjectsData?.();
                    const isTeam = data && data[id]?.team;
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
                if (id) {
                    const data = client.TeamManager.getAccumulatedObjectsData?.();
                    const isTeam = data && data[id]?.team;
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
            callback: (m: RegExpMatchArray) => exec(m[1], "rozkaz zaatakowac")
        });
        aliases.push({
            pattern: /^\/ra$/,
            callback: () => {
                const id = client.TeamManager.getAttackTargetId();
                if (id) {
                    client.sendCommand(`rozkaz zaatakowac ob_${id}`);
                }
            }
        });
        aliases.push({
            pattern: /\/rz ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => {
                const obj = findByShortcut(m[1]);
                if (obj) {
                    client.sendCommand(`rozkaz zaslonic ob_${obj.num}`);
                }
            }
        });
        aliases.push({
            pattern: /^\/rz$/,
            callback: () => {
                const id = client.TeamManager.getDefenseTargetId();
                if (id) {
                    client.sendCommand(`rozkaz zaslonic ob_${id}`);
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
                const obj = findByShortcut(m[1]);
                if (obj) {
                    client.sendCommand(`wskaz ob_${obj.num} jako cel obrony`);
                }
            }
        });
    }
}
