import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

const COLORS = [
    findClosestColor("#ff0000"),
    findClosestColor("#ffa500"),
    findClosestColor("#ffff00"),
    findClosestColor("#00ff00"),
    findClosestColor("#87ceeb"),
];

const skillsDesc: Record<string, number> = {
    ledwo: 1,
    troche: 2,
    pobieznie: 3,
    zadowalajaco: 4,
    niezle: 5,
    dobrze: 6,
    znakomicie: 7,
    doskonale: 8,
    perfekcyjnie: 9,
    mistrzowsko: 10,
};

function getColor(level: number) {
    if (level === 10) {
        return COLORS[4];
    }
    if (level >= 7) {
        return COLORS[3];
    }
    if (level >= 5) {
        return COLORS[2];
    }
    if (level >= 3) {
        return COLORS[1];
    }
    return COLORS[0];
}

function formatLine(line: string) {
    return line.replace(
        /([^:]+):(\s+)([a-z]+)(\s*)/g,
        (substring, skillPart: string, afterColon: string, desc: string, trailing: string) => {
            const level = skillsDesc[desc as keyof typeof skillsDesc];
            if (!level) {
                return substring;
            }

            const color = getColor(level);
            const leading = skillPart.match(/^\s*/)?.[0] ?? "";
            const skill = skillPart.trim();

            const bracket = level === 10 ? "[10/10]" : `[${level}/10]`;
            const coloredSkill = colorString(`${skill}:`, color);
            const coloredBracket = colorString(bracket, color);

            const trailingLen = trailing.length;
            let spacesAfter = trailingLen >= 3 ? 3 : 0;
            let spacesBefore = trailingLen - spacesAfter;
            if (spacesBefore < 1) {
                spacesBefore = 1;
                spacesAfter = Math.max(0, trailingLen - spacesBefore);
            }

            return `${leading}${coloredSkill}${afterColon}${desc}${" ".repeat(spacesBefore)}${coloredBracket}${" ".repeat(spacesAfter)}`;
        }
    );
}

export default function initSkills(client: Client) {
    const tag = "skills";
    const patterns = Object.keys(skillsDesc).map(d => new RegExp(d));
    client.Triggers.registerTrigger(patterns, raw => formatLine(raw), tag);
}

