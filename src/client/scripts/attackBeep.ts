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

    const handleAttack = (line: AnsiAwareBuffer, matches: RegExpMatchArray, always: boolean): AnsiAwareBuffer => {
        const attackerName = matches?.groups?.name
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

    // Plain attack lines beep only for enemy guilds
    [
        /(?<name>.*) atakuje cie!/,
        /(?<name>.*) atakuje cie nie dajac ci czasu na skontrowanie swojego ataku!/,
        /^Ku twojemu zdumieniu, (?<name>.*) pojawil sie nagle tuz obok ciebie!/,
        /^Oczy (?<name>.*) zachodza woalem rytualnego transu, gdy jak blyskawica rzuca sie on na ciebie, rozniecajac burze Tanca Smierci!/,
    ].forEach(p => client.Triggers.registerTrigger(p, (line, matches) => handleAttack(line, matches, false), tag));

    // Special attacks only players can make beep for anyone, as in Mudlet
    [
        /^W oczach (?<name>.*) rozpala sie swiety ogien nienawisci i z imieniem Morra na ustach (?<upper>rzuca sie do walki z toba)!/,
        /^(?<name>\w+(?: \w+){0,4}) z determinacja i pewnoscia siebie unosi swoja bron i (?<upper>naciera na ciebie)!/,
        /^(?<name>\w+(?: \w+){0,4}) z pierwotna wsciekloscia (?<upper>rzuca sie na ciebie), rozpoczynajac walke!/,
        /^(?<name>\w+(?: \w+){0,4}) z pelnym przebieglosci blyskiem w oku (?<upper>rzuca sie na ciebie)!/,
        /^Przy ogluszajacym akompaniamencie okrzyku bojowego '[^']*' (?<name>\w+(?: \w+){0,4}) (?<upper>rzuca sie na ciebie), wiazac cie/
    ].forEach(p => client.Triggers.registerTrigger(p, (line, matches) => handleAttack(line, matches, true), tag));

    client.Triggers.registerTrigger('atakuje cie!', (line) => {
        return highlightPhrase(line);
    }, tag);
}
