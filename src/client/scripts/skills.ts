import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";
import { stripAnsiCodes } from "../Triggers";

const COLORS = [
    findClosestColor("#ff0000"),
    findClosestColor("#ff0000"),
    findClosestColor("#ff0000"),
    findClosestColor("#ffa500"),
    findClosestColor("#ffa500"),
    findClosestColor("#ffff00"),
    findClosestColor("#ffff00"),
    findClosestColor("#00ff00"),
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

function pad(str: string, len: number) {
    const plain = stripAnsiCodes(str);
    return str + " ".repeat(Math.max(0, len - plain.length));
}

function colorLevel(level: string, maxLevel: number) {
    const num = skillsDesc[level.toLowerCase()];
    const bracketWidth = "[10/10]".length;
    if (!num) {
        return pad(level, maxLevel + 1 + bracketWidth);
    }
    const color = COLORS[num - 1];
    const word = pad(level, maxLevel);
    const bracket = `[${num}/10]`.padStart(bracketWidth);
    return colorString(`${word} ${bracket}`, color);
}

export default function initSkills(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "skills";
    let timer: ReturnType<typeof setTimeout> | undefined;

    function disable() {
        client.Triggers.removeByTag(tag);
        if (timer) {
            clearTimeout(timer);
            timer = undefined;
        }
    }

    function formatSkill(
        { name, level }: { name: string; level: string },
        maxName: number,
        maxLevel: number
    ) {
        const n = pad(`${name}:`, maxName + 1);
        const l = colorLevel(level, maxLevel);
        return `${n} ${l}`;
    }

    function process(raw: string) {
        const lines = raw.split("\n").filter((l) => /[^:]+:\s+\S+/.test(stripAnsiCodes(l)));
        const skills: { name: string; level: string }[] = [];
        lines.forEach((l) => {
            const pairs = l.match(/[^:]+:\s+\S+/g);
            pairs?.forEach((p) => {
                const m = p.match(/([^:]+):\s+(\S+)/);
                if (m) skills.push({ name: m[1].trim(), level: m[2].trim() });
            });
        });
        if (!skills.length) return raw;

        const maxName = Math.max(...skills.map((s) => s.name.length));
        const maxLevel = Math.max(...skills.map((s) => s.level.length));
        const result: string[] = [];
        for (let i = 0; i < skills.length; i += 2) {
            const col1 = formatSkill(skills[i], maxName, maxLevel);
            if (i + 1 < skills.length) {
                const col2 = formatSkill(skills[i + 1], maxName, maxLevel);
                const combined = `${col1}  ${col2}`;
                if (
                    client.contentWidth &&
                    stripAnsiCodes(combined).length > client.contentWidth
                ) {
                    result.push(col1, col2);
                } else {
                    result.push(combined);
                }
            } else {
                result.push(col1);
            }
        }
        return result.join("\n");
    }

    function run() {
        disable();
        client.Triggers.registerMultilineTrigger(
            /[^:]+:\s+\S+/,
            (raw) => {
                const out = process(raw);
                disable();
                return out;
            },
            tag
        );
        timer = setTimeout(disable, 1000);
        client.send("um");
    }

    if (aliases) {
        aliases.push({ pattern: /^um$/, callback: run });
    }
}
