import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {gmcp, setGmcp} from "../gmcp";
import { createAttackController } from "../utils/attackController";
import eventBus from "@modules/core/eventBus";
import initAllyProtection from "./allyProtection";
import { getCoverTracker } from "./coverTracker";
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

    function exec(query: string, command: string, prefer: 'team' | 'enemy') {
        const obj = findTarget(query, prefer);
        if (obj) {
            client.sendCommand(`${command} ob_${obj.num}`);
        }
    }

    function fold(text: string) {
        return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").split(String.fromCharCode(0x142)).join("l");
    }

    /**
     * Shortcut first, then the object's description: an exact match, then the
     * query as the start of a word ("gerw" -> "Gerwazy", "gob" -> "zielony
     * goblin"), then anywhere in it. The first tier with exactly one hit wins,
     * so the shortest unique fragment is enough. Within an ambiguous tier the
     * alias's side settles it: a lone team member for support aliases (cover,
     * withdraw, lead), a lone non-team hit for attack ones. Case and Polish
     * diacritics are ignored. Ambiguity or no hit prints why instead of
     * silently doing nothing.
     */
    function findTarget(query: string, prefer: 'team' | 'enemy') {
        const byShortcut = findByShortcut(query);
        if (byShortcut) {
            return byShortcut;
        }
        const needle = fold(query.trim());
        const named = client.ObjectManager.getObjectsOnLocation()
            .filter(o => o.desc && o.shortcut !== '@')
            .map(o => ({ obj: o, desc: fold(o.desc!) }));
        const tiers = [
            named.filter(n => n.desc === needle),
            named.filter(n => n.desc.startsWith(needle) || n.desc.includes(` ${needle}`)),
            named.filter(n => n.desc.includes(needle)),
        ];
        for (const tier of tiers) {
            if (tier.length === 1) {
                return tier[0].obj;
            }
            if (tier.length > 1) {
                const data = client.TeamManager.getAccumulatedObjectsData?.();
                const side = tier.filter(n => !!data?.get(n.obj.num)?.team === (prefer === 'team'));
                if (side.length === 1) {
                    return side[0].obj;
                }
                const list = tier.map(n => `${n.obj.desc}${n.obj.shortcut ? ` (${n.obj.shortcut})` : ''}`).join(', ');
                client.print(`Niejednoznaczne "${query}": ${list}`);
                return undefined;
            }
        }
        client.print(`Nie ma tu nikogo pasujacego do "${query}".`);
        return undefined;
    }

    function shield(query: string) {
        const obj = findTarget(query, 'team');
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

    function withdraw(query: string) {
        const obj = findTarget(query, 'team');
        if (obj) {
            client.sendCommand(`gzwycofaj sie za ob_${obj.num}`);
            if (releaseGuard) {
                client.goOutOfGuard();
            }
        }
    }

    function passLeadership(query: string) {
        const obj = findTarget(query, 'team');
        if (obj) {
            client.sendCommand(`przekaz prowadzenie ob_${obj.num}`);
        }
    }

    function isOnLocation(id: number): boolean {
        return client.ObjectManager.getObjectsOnLocation().some(o => o.num === id);
    }

    /**
     * Every id here is validated against the room before it is sent. A target
     * marked in an earlier room used to reach `przelam obrone ob_<stale>`, which
     * the game answers with "Nie widzisz zadnej takiej osoby." - a wasted round
     * in the middle of a fight.
     */
    function breakDefenseTarget(query?: string) {
        let id: number | undefined;
        let alreadyFighting = false;

        if (query) {
            id = findTarget(query, 'enemy')?.num;
            if (id === undefined) {
                return; // findTarget already said why
            }
        } else {
            const marked = client.TeamManager.getAttackTargetId();
            if (marked !== undefined && isOnLocation(marked)) {
                id = marked;
            } else {
                // No usable marked target - fall back to whoever we are fighting now.
                const engaged = client.TeamManager.getAvatarAttackTargetId();
                if (engaged !== undefined && isOnLocation(engaged)) {
                    id = engaged;
                    alreadyFighting = true;
                } else {
                    // Last resort: whoever the cover tracker says is blocking us.
                    const playerNum = client.TeamManager.playerNum;
                    const covered = playerNum !== undefined
                        ? getCoverTracker()?.getCoveredForAttacker(playerNum) ?? []
                        : [];
                    id = covered.find(isOnLocation);
                }
            }
        }

        if (id === undefined || !isOnLocation(id)) {
            client.print(
                "Nie wiem, komu przelamac obrone - zaznacz cel lub zaatakuj kogos, "
                + "kto jest zaslaniany.");
            return;
        }

        client.sendCommand("przestan kryc sie za zaslona");
        client.sendCommand(`przelam obrone ob_${id}`);
        if (!alreadyFighting) {
            attackById(id);
        }
    }

    const attackController = createAttackController(client);
    const allyProtection = initAllyProtection(client);

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

    function attack(query: string) {
        const obj = findTarget(query, 'enemy');
        if (obj) {
            attackById(obj.num);
        }
    }

    function surprise(query: string) {
        const obj = findTarget(query, 'enemy');
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
            pattern: /^\/z (.+)$/,
            callback: (m: RegExpMatchArray) => attack(m[1])
        });
        aliases.push({
            pattern: /^\/x (.+)$/,
            callback: (m: RegExpMatchArray) => surprise(m[1])
        });
        aliases.push({
            pattern: /^\/zas (.+)$/,
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
                attackController.attackAllEnemies((id) => allyProtection.isAlly(id));
            }
        });
        aliases.push({
            pattern: /^\/z_all!$/,
            callback: () => {
                attackController.attackAllNonTeam((id) => allyProtection.isAlly(id));
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
            pattern: /^\/zap (.+)$/,
            callback: (m: RegExpMatchArray) => exec(m[1], "zapros", 'enemy')
        });
        aliases.push({
            pattern: /^\/za (.+)$/,
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
            pattern: /^\/za([234]) (.+)$/,
            callback: (m: RegExpMatchArray) => {
                // Fall back to the game default — restoring an undefined value
                // would serialize to an empty payload and leave the elevated
                // cover active on the server.
                const original = gmcp?.char?.options?.group_cover ?? 1;
                const coverValue = parseInt(m[1], 10);
                client.sendGMCP('char.options', {group_cover: coverValue});
                setGmcp('char.options.group_cover', coverValue);
                shield(m[2]);
                client.sendGMCP('char.options', {group_cover: original});
                setGmcp('char.options.group_cover', original);
            }
        });
        aliases.push({
            pattern: /^\/w (.+)$/,
            callback: (m: RegExpMatchArray) => withdraw(m[1])
        });
        aliases.push({
            pattern: /^\/pro (.+)$/,
            callback: (m: RegExpMatchArray) => passLeadership(m[1])
        });
        aliases.push({
            pattern: /^\/prze(?: (.+))?$/,
            callback: (m?: RegExpMatchArray) => breakDefenseTarget(m?.[1])
        });
        aliases.push({
            pattern: /^\/ra (.+)$/,
            callback: (m: RegExpMatchArray) => {
                const obj = findTarget(m[1], 'enemy');
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
            pattern: /^\/rz (.+)$/,
            callback: (m: RegExpMatchArray) => {
                if (m[1] === '@') {
                    client.sendCommand(`wskaz siebie jako cel obrony`);
                    client.sendCommand(`rozkaz druzynie zaslonic siebie`);
                    return;
                }
                const obj = findTarget(m[1], 'team');
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
            pattern: /^\/wa (.+)$/,
            callback: (m: RegExpMatchArray) => {
                const obj = findTarget(m[1], 'enemy');
                if (obj) {
                    client.sendCommand(`wskaz ob_${obj.num} jako cel ataku`);
                }
            }
        });
        aliases.push({
            pattern: /^\/wz (.+)$/,
            callback: (m: RegExpMatchArray) => {
                if (m[1] === '@') {
                    client.sendCommand(`wskaz siebie jako cel obrony`);
                    return;
                }
                const obj = findTarget(m[1], 'team');
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
