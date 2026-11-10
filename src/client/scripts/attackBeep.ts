import Client from "../Client";
import {createColorFormat} from "@client/Colors.ts";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import { getEnemyDetector } from "../EnemyDetector";

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
    // The attacker is a name, or a description when not introduced
    // ("Muskularny zielonooki krasnolud atakuje cie!"); the shared check takes both.
    const enemyDetector = getEnemyDetector(client);

    const handleAttack = (line: AnsiAwareBuffer, matches: RegExpMatchArray, always: boolean): AnsiAwareBuffer => {
        const attackerName = matches?.groups?.name
        const isEnemy = !!attackerName && enemyDetector.isEnemy(attackerName);

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

    // Plain attack lines beep only for enemies (marked, or of an enemy guild)
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
