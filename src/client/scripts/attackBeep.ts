import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import { subscribe as subscribeToPeopleStore, refresh as refreshPeopleStore } from '@modules/data/peopleStore';
import type { PersonEntry } from '../types/people';
import {AnsiAwareBuffer} from "../ansi/FormatState";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

const RED = createColorFormat("#ff0000");

function highlightPhrase(buffer: AnsiAwareBuffer): AnsiAwareBuffer {
    const phrase = "atakuje cie";
    const text = buffer.text;
    const matchIndex = text.indexOf(phrase);
    if (matchIndex !== -1) {
        buffer.replace([matchIndex, matchIndex + phrase.length], phrase.toUpperCase());
    }
    buffer.color([0, buffer.length], RED);
    return buffer;
}

/**
 * Attack lines are matched upstream: the `skrypty/events` triggers in Arkadia.xml
 * raise `attacked` (and colour the special-attack lines), and luaGags.ts runs them
 * from `events_lua.json`, which `scripts/extract-gags.js` regenerates. The patterns
 * used to be copied here by hand, and the copies drifted - two of them lost their
 * attacker group, so those lines could never beep. New attack lines belong upstream.
 */
export default function initAttackBeep(client: Client) {
    const tag = "attackBeep";
    let enemyGuilds: string[] = [];
    let peopleCache: PersonEntry[] = [];

    subscribeToPeopleStore(snapshot => {
        peopleCache = snapshot ?? [];
    });

    function ensurePeopleLoaded() {
        return refreshPeopleStore().catch(error => {
            console.warn('Failed to load people database', error);
            return undefined;
        });
    }

    ensurePeopleLoaded().catch(() => undefined);

    // Find a person's guild by name, or by description when the attacker is
    // not introduced ("Muskularny zielonooki krasnolud atakuje cie!")
    function findPersonGuild(name: string): string | null {
        const lowered = name.toLowerCase();
        const person = peopleCache.find(p => p.name === name)
            ?? peopleCache.find(p => p.description?.toLowerCase() === lowered);
        return person ? person.guild : null;
    }

    // Function to check if an attacker should trigger the beep
    function shouldBeep(attackerName: string): boolean {
        if (enemyGuilds.length === 0) {
            return false; // If no enemy guilds selected no beep needed
        }
        const guild = findPersonGuild(attackerName);
        // Beep only when we know the attacker belongs to an enemy guild
        return !!guild && enemyGuilds.includes(guild);
    }

    const handleAttack = (attackerName: string, always: boolean) => {
        const isEnemy = !!attackerName && shouldBeep(attackerName);

        // Fires for every attack line, whoever the attacker is — the
        // unconditional counterpart of "enemy.attack" below.
        client.sendEvent("attack", { attacker: attackerName ?? "", enemy: isEnemy });

        if (always || (attackerName && isEnemy)) {
            client.sendEvent("sound:category", "attack");
            // Fires under exactly the same condition as the beep, so binding
            // this event in the trigger editor means what it says on the label.
            client.sendEvent("enemy.attack", { attacker: attackerName ?? "" });
        }
    };

    // Listen for settings changes
    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as { enemyGuilds?: unknown };
        if (Array.isArray(detail.enemyGuilds)) {
            enemyGuilds = [...detail.enemyGuilds];
        }
        ensurePeopleLoaded().catch(() => undefined);
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', (settings) => {
        applySettings(settings);
    });

    // Plain attack lines beep only for enemy guilds; special attacks only
    // players can make beep for anyone, as in Mudlet.
    client.on("attacked", (attacker, special) => handleAttack(attacker, !!special));

    client.Triggers.registerTrigger('atakuje cie!', (line) => {
        return highlightPhrase(line);
    }, tag);
}
