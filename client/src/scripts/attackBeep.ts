import Client from "../Client";
import {colorString, findClosestColor} from "../Colors";
import appEventBus from "../events/app-event-bus";
import {PersonEntry} from "../types/people";
import {dataCatalog} from "../dataCatalog/catalogInstance";

const RED = findClosestColor("#ff0000");

function highlightAttack(line: string, upper?: string) {
    if (upper && line.includes(upper)) {
        line = line.replace(upper, upper.toUpperCase());
    }
    return colorString(line, RED);
}

function highlightPhrase(line: string) {
    const phrase = "atakuje cie";
    const colored = colorString(line, RED);
    return colored.replace(phrase, phrase.toUpperCase());
}

export default function initAttackBeep(client: Client) {
    const tag = "attackBeep";
    let enemyGuilds: string[] = [];
    let peopleCache: PersonEntry[] = [];


    dataCatalog.getPeopleStore().getData().then(people => {
        peopleCache = people;
    })

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

    const beep = (raw: string, _line: string, matches: RegExpMatchArray): string => {
        const attackerName = (matches.groups && (matches.groups as any).name) as string | undefined;

        if (attackerName && !shouldBeep(attackerName)) {
            // Don't beep, but still highlight the attack
            const upper = (matches.groups && (matches.groups as any).upper) as string | undefined;
            return highlightAttack(raw, upper);
        }

        client.playSound("beep");
        const upper = (matches.groups && (matches.groups as any).upper) as string | undefined;
        return highlightAttack(raw, upper);
    };

    // Listen for settings changes
    appEventBus.on("settings", (settings) => {
        if (Array.isArray(settings.enemyGuilds)) {
            enemyGuilds = [...settings.enemyGuilds];
        }
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

    client.Triggers.registerTrigger(/atakuje cie!$/, (_r, line) => highlightPhrase(line), tag);
}
