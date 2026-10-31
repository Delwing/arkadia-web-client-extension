import Client from "../Client";

/**
 * `trenuj` takes the skill in the accusative, while the trainer's list shows the nominative.
 * Skills missing here keep the name as listed: plural and inanimate nouns ("miecze",
 * "mierzony cios") and neuter nouns ("wyczucie kierunku") are the same in both cases.
 */
const ACCUSATIVE: Record<string, string> = {
    "akrobatyka": "akrobatyke",
    "alchemia": "alchemie",
    "ocena obiektu": "ocene obiektu",
    "ocena przeciwnika": "ocene przeciwnika",
    "opieka nad zwierzetami": "opieke nad zwierzetami",
    "walka bez broni": "walke bez broni",
    "walka dwiema bronmi": "walke dwiema bronmi",
    "walka pokazowa": "walke pokazowa",
    "walka w ciemnosci": "walke w ciemnosci",
    "walka w szyku": "walke w szyku",
    "wspinaczka": "wspinaczke",
};

/**
 * The form of a skill name `trenuj` accepts. Unknown skills fall back to declining the head
 * noun: a feminine first word ending in -a takes -e.
 */
export function skillToAccusative(skill: string): string {
    const known = ACCUSATIVE[skill];
    if (known) {
        return known;
    }
    const [head, ...rest] = skill.split(" ");
    if (!head.endsWith("a")) {
        return skill;
    }
    return [head.slice(0, -1) + "e", ...rest].join(" ");
}

/**
 * A trainer's skill list ("Oto umiejetnosci, w jakich mozesz sie szkolic:") — each skill
 * name becomes a link that sends `trenuj <skill>` with the skill in the accusative.
 */
export default function initTrainerSkills(client: Client) {
    const tag = "trainerSkills";
    const header = /^Oto umiejetnosci, w jakich mozesz sie szkolic:$/;
    const row = /^(\s*)([a-z][a-z ]*?)\s+\d+ (?:zlot|srebrn|miedzian)\S* .*monet[ay]?\.?$/;

    const parent = client.Triggers.registerTrigger(header, undefined, tag, { stayOpenLines: 60 });

    parent.registerChild(row, (line, matches) => {
        const start = matches[1].length;
        const skill = matches[2];
        const command = `trenuj ${skillToAccusative(skill)}`;
        return line.createLink([start, start + skill.length], {
            onClick: () => client.sendCommand(command),
            title: command,
        });
    }, tag);
}
