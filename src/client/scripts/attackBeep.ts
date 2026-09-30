import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import { subscribe as subscribeToPeopleStore, refresh as refreshPeopleStore } from '@modules/data/peopleStore';
import type { PersonEntry } from '../types/people';
import {AnsiAwareBuffer} from "../ansi/FormatState";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import attackBeepPatterns from "./attack_beep_patterns.json";
import { upstreamPatterns, type UpstreamTrigger } from "./upstreamTriggers";

// Generated from upstream Arkadia.xml by scripts/extract-upstream-triggers.mjs.
const UPSTREAM = attackBeepPatterns as UpstreamTrigger[];

const RED = createColorFormat("#ff0000");

function highlightAttack(buffer: AnsiAwareBuffer, upper?: string): AnsiAwareBuffer {
    const text = buffer.text;
    if (upper) {
        const matchIndex = text.indexOf(upper);
        if (matchIndex !== -1) {
            buffer.replace([matchIndex, matchIndex + upper.length], upper.toUpperCase());
        }
    }
    buffer.color([0, buffer.length], RED);
    return buffer;
}

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

    // Function to find a person's guild by their name
    function findPersonGuild(name: string): string | null {
        const person = peopleCache.find(p => p.name === name);
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

    // Upstream passes the capture groups positionally (matches[2], matches[3]
    // in Lua): the attacker first, then — for the player phrasings — the
    // phrase to uppercase.
    const beep = (line: AnsiAwareBuffer, matches: RegExpMatchArray, upper?: string): AnsiAwareBuffer => {
        const attackerName = matches?.[1];
        const isEnemy = !!attackerName && shouldBeep(attackerName);

        // Fires for every attack line, whoever the attacker is — the
        // unconditional counterpart of "enemy.attack" below.
        client.sendEvent("attack", { attacker: attackerName ?? "", enemy: isEnemy });

        if (attackerName && isEnemy) {
            client.sendEvent("sound:category", "attack");
            // Fires under exactly the same condition as the beep — an attacker
            // whose guild the player marked hostile — so binding this event in
            // the trigger editor means what it says on the label.
            client.sendEvent("enemy.attack", { attacker: attackerName });
        }

        return highlightAttack(line, upper);
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

    client.Triggers.registerTrigger(
        upstreamPatterns(UPSTREAM, "trigger_func_skrypty_misc_atakuje_cie_beep"),
        (line, matches) => beep(line, matches),
        tag,
    );
    client.Triggers.registerTrigger(
        upstreamPatterns(UPSTREAM, "trigger_func_skrypty_misc_player_atakuje_cie_beep"),
        (line, matches) => beep(line, matches, matches?.[2]),
        tag,
    );

    client.Triggers.registerTrigger(
        upstreamPatterns(UPSTREAM, "trigger_func_skrypty_ui_misc_fighting_atakuje_cie"),
        (line) => highlightPhrase(line),
        tag,
    );
}
