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
    return COLORS[Math.min(COLORS.length - 1, Math.floor((level - 1) / 2))];
}

function padLevel(level: number) {
    return level < 10 ? ` ${level}` : `${level}`;
}

function formatLine(line: string) {
    return line.replace(/([^:]+):\s+([a-z]+)/g, (substring, skillPart: string, desc: string) => {
        const level = skillsDesc[desc as keyof typeof skillsDesc];
        if (!level) {
            return substring;
        }
        const color = getColor(level);
        const leading = skillPart.match(/^\s*/)?.[0] ?? "";
        const skill = skillPart.trim();
        const coloredSkill = colorString(skill, color);
        const coloredLevel = colorString(`[${padLevel(level)}/10]`, color);
        return `${leading}${coloredSkill}: ${coloredLevel}`;
    });
}

export default function initSkills(client: Client) {
    const tag = "skills";
    const patterns = Object.keys(skillsDesc).map(d => new RegExp(d));
    client.Triggers.registerTrigger(patterns, raw => formatLine(raw), tag);
}

