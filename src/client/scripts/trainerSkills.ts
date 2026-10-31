import Client from "../Client";

/**
 * A trainer's skill list ("Oto umiejetnosci, w jakich mozesz sie szkolic:") — each skill
 * name becomes a link that sends `trenuj <skill>`.
 */
export default function initTrainerSkills(client: Client) {
    const tag = "trainerSkills";
    const header = /^Oto umiejetnosci, w jakich mozesz sie szkolic:$/;
    const row = /^(\s*)([a-z][a-z ]*?)\s+\d+ (?:zlot|srebrn|miedzian)\S* .*monet[ay]?\.?$/;

    const parent = client.Triggers.registerTrigger(header, undefined, tag, { stayOpenLines: 60 });

    parent.registerChild(row, (line, matches) => {
        const start = matches[1].length;
        const skill = matches[2];
        const command = `trenuj ${skill}`;
        return line.createLink([start, start + skill.length], {
            onClick: () => client.sendCommand(command),
            title: command,
        });
    }, tag);
}
