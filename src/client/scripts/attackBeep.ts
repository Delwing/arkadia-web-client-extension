import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import { subscribe as subscribeToPeopleStore, refresh as refreshPeopleStore } from '@modules/data/peopleStore';
import type { PersonEntry } from '../types/people';
import {AnsiAwareBuffer} from "../ansi/FormatState";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

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

    const beep = (line: AnsiAwareBuffer, matches: RegExpMatchArray): AnsiAwareBuffer => {
        const attackerName = matches?.groups?.name

        if (attackerName && shouldBeep(attackerName)) {
            client.sendEvent("sound:category", "attack");
        }

        const upper = matches?.groups?.upper
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

    [
        /(?<name>.*) atakuje cie!/,
        /(?<name>.*) atakuje cie nie dajac ci czasu na skontrowanie swojego ataku!/,
        /^Ku twojemu zdumieniu, (?<name>.*) pojawil sie nagle tuz obok ciebie!/,
        /^Oczy (?<name>.*) zachodza woalem rytualnego transu, gdy jak blyskawica rzuca sie on na ciebie, rozniecajac burze Tanca Smierci!/,
        /^W oczach (?<name>.*) rozpala sie swiety ogien nienawisci i z imieniem Morra na ustach (?<upper>rzuca sie do walki z toba)!/,
        /^\w+(?: \w+){0,4} z determinacja i pewnoscia siebie unosi swoja bron i (?<upper>naciera na ciebie)!/,
        /^\w+(?: \w+){0,4} z pierwotna wsciekloscia (?<upper>rzuca sie na ciebie), rozpoczynajac walke!/
    ].forEach(p => client.Triggers.registerTrigger(p, beep, tag));

    client.Triggers.registerTrigger('atakuje cie!', (line) => {
        return highlightPhrase(line);
    }, tag);
}
