import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

const COLORS = [
    findClosestColor("#ff0000"),
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
    if (level <= 3) {
        return COLORS[0];
    }
    if (level <= 6) {
        return COLORS[1];
    }
    if (level <= 9) {
        return COLORS[2];
    }
    return COLORS[3];
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
            const coloredSkill = colorString(`${skill}:`, color);

            const levelStr = `[${level}/10]`;
            const paddedLevel = `${level < 10 ? " " : ""}${levelStr}`;
            const coloredLevel = colorString(paddedLevel, color);

            const beforeLevelSpacesCount = Math.max(1, trailing.length - 3);
            const afterLevelSpacesCount = Math.min(3, trailing.length);
            const beforeLevelSpaces = " ".repeat(beforeLevelSpacesCount);
            const afterLevelSpaces = " ".repeat(afterLevelSpacesCount);

            return `${leading}${coloredSkill}${afterColon}${desc}${beforeLevelSpaces}${coloredLevel}${afterLevelSpaces}`;
        }
    );
}

export default function initSkills(client: Client) {
    const tag = "skills";
    const patterns = Object.keys(skillsDesc).map(d => new RegExp(d));
    client.Triggers.registerTrigger(patterns, raw => formatLine(raw), tag);
}

