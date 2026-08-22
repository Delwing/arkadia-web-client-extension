import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {gmcp, setGmcp} from "../gmcp";
import { createAttackController } from "../utils/attackController";
import eventBus from "@modules/core/eventBus";
import { subscribeMerged, refresh as refreshPeopleStore } from '@modules/data/peopleLoader';
import type { PersonListEntry } from '../types/people';
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

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
        let id: number | undefined;
        if (short) {
            const obj = findByShortcut(short);
            id = obj?.num;
        } else {
            id = client.TeamManager.getAttackTargetId();
        }
        if (id) {
            client.sendCommand("przestan kryc sie za zaslona");
            client.sendCommand(`przelam obrone ob_${id}`);
            attackById(id);
        }
    }

    const attackController = createAttackController(client);

    let enemyGuilds: string[] = [];
    let allyGuilds: string[] = [];
    let peopleCache: PersonListEntry[] = [];

    subscribeMerged(snapshot => {
        peopleCache = snapshot ?? [];
    });
    refreshPeopleStore().catch(() => undefined);

    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as { enemyGuilds?: unknown; allyGuilds?: unknown };
        if (Array.isArray(detail.enemyGuilds)) {
            enemyGuilds = [...detail.enemyGuilds];
        }
        if (Array.isArray(detail.allyGuilds)) {
            allyGuilds = [...detail.allyGuilds];
        }
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applySettings);

    function isEnemyByName(name: string): boolean {
        const person = peopleCache.find(p => p.name === name);
        if (!person) return false;
        if (person.isAlly) return false;
        if (person.isEnemy) return true;
        return enemyGuilds.includes(person.guild);
    }

    function isAllyByName(name: string): boolean {
        const person = peopleCache.find(p => p.name === name);
        if (!person) return false;
        if (person.isAlly) return true;
        return allyGuilds.includes(person.guild);
    }

    const INTRODUCED_NAME = /^[A-Z][a-z]+$/;
    const ZAP_COLOR = createColorFormat("#00ff7f");

    function inviteAll() {
        const objects = client.ObjectManager.getObjectsOnLocation();
        const targets = objects.filter(o =>
            o.__category === 'rest-noncombat' &&
            o.desc &&
            INTRODUCED_NAME.test(o.desc) &&
            !isEnemyByName(o.desc)
        );

        if (targets.length === 0) {
            client.print(colorString('Nie ma kogo zaprosic.', ZAP_COLOR));
            return;
        }

        for (const t of targets) {
            client.sendCommand(`zapros ob_${t.num}`);
        }
    }

    function inviteAllAllies() {
        const objects = client.ObjectManager.getObjectsOnLocation();
        const targets = objects.filter(o =>
            o.__category !== 'player' &&
            o.__category !== 'team' &&
            o.desc &&
            INTRODUCED_NAME.test(o.desc) &&
            isAllyByName(o.desc)
        );

        if (targets.length === 0) {
            client.print(colorString('Nie ma kogo zaprosic.', ZAP_COLOR));
            return;
        }

        for (const t of targets) {
            client.sendCommand(`zapros ob_${t.num}`);
        }
    }

    // Ally protection lives in a command hook, so every attack below is gated
    // regardless of which path reached it.
    const attackById = (id: number, command?: string) => {
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
            pattern: /^\/z_id ((?:ob_)?[0-9]+)$/,
            callback: (m: RegExpMatchArray) => {
                const idStr = m[1].replace(/^ob_/, '');
                const id = parseInt(idStr, 10);
                if (!isNaN(id)) {
                    attackById(id);
                }
            }
        });
        aliases.push({
            pattern: /^\/z_all$/,
            callback: () => {
                attackController.attackAllEnemies();
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
            pattern: /\/zap \*$/,
            callback: () => inviteAllAllies()
        });
        aliases.push({
            pattern: /\/zap 0$/,
            callback: () => inviteAll()
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
                const state = releaseGuard ? 'puszczam' : 'nie puszczam';
                client.print(colorString(`Puszczanie zaslon: ${state}`, color));
                client.sendEvent('releaseGuard', releaseGuard);
            }
        });
        aliases.push({
            pattern: /^\/za([234]) ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => {
                const original = gmcp?.char?.options?.group_cover;
                const coverValue = parseInt(m[1], 10);
                client.sendGMCP('char.options', {group_cover: coverValue});
                setGmcp('char.options.group_cover', coverValue);
                shield(m[2]);
                client.sendGMCP('char.options', {group_cover: original});
                setGmcp('char.options.group_cover', original);
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
            callback: (m: RegExpMatchArray) => {
                const obj = findByShortcut(m[1]);
                if (obj) {
                    client.sendCommand(`wskaz ob_${obj.num} jako cel ataku`);
                    client.sendCommand(`rozkaz druzynie zaatakowac ob_${obj.num}`);
                }
            }
        });
        aliases.push({
            pattern: /^\/ra$/,
            callback: () => {
                const id = client.TeamManager.getAttackTargetId();
                if (id !== undefined) {
                    client.sendCommand(`wskaz ob_${id} jako cel ataku`);
                    client.sendCommand(`rozkaz druzynie zaatakowac ob_${id}`);
                }
            }
        });
        aliases.push({
            pattern: /\/rz ([A-Za-z0-9@]+)$/,
            callback: (m: RegExpMatchArray) => {
                if (m[1] === '@') {
                    client.sendCommand(`wskaz siebie jako cel obrony`);
                    client.sendCommand(`rozkaz druzynie zaslonic siebie`);
                    return;
                }
                const obj = findByShortcut(m[1]);
                if (obj) {
                    client.sendCommand(`wskaz ob_${obj.num} jako cel obrony`);
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
                        client.sendCommand(`wskaz siebie jako cel obrony`);
                        client.sendCommand(`rozkaz druzynie zaslonic siebie`);
                    } else {
                        client.sendCommand(`wskaz ob_${id} jako cel obrony`);
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
            pattern: /^\/zz (.+)$/,
            callback: (m: RegExpMatchArray) => {
                attackController.attackByTarget(m[1]);
            }
        });
        aliases.push({
            pattern: /^\/walka_restart$/,
            callback: () => {
                client.ObjectManager.resetTeamShortcuts();
                client.print(colorString('Skroty druzyny zresetowane.', createColorFormat("#FFA500")));
            }
        });
        aliases.push({
            pattern: /^\/demo_kondycje$/,
            callback: () => eventBus.emit("objectListDemo.popup.open")
        });
        // The demo popup fakes GMCP straight onto the event bus, but the gold
        // "next target" mark comes from the real attack queue in TeamManager —
        // which lives client-side. Let the popup drive it through this event.
        eventBus.on("objectListDemo.setQueue", ({ ids }) => {
            client.TeamManager.clearEnemyQueue();
            for (const id of ids) {
                client.TeamManager.addEnemyToQueue(id);
            }
        });
    }

}
