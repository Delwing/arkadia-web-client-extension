import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import { stripAnsiCodes } from "../Triggers";
import { SKIP_LINE } from "../ControlConstants";

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

function colorLevel(level: string) {
    const num = skillsDesc[level.toLowerCase()];
    if (!num) return level;
    const color = COLORS[num - 1];
    return colorString(level, color);
}

export default function initSkills(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "skills";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lines: string[] = [];

    function finish() {
        client.Triggers.removeByTag(tag);
        timer = undefined;
        if (!lines.length) return;

        const skills: { name: string; level: string }[] = [];
        lines.forEach((l) => {
            const pairs = l.match(/[^:]+:\s+\S+/g);
            pairs?.forEach((p) => {
                const m = p.match(/([^:]+):\s+(\S+)/);
                if (m) skills.push({ name: m[1].trim(), level: m[2].trim() });
            });
        });
        lines = [];
        if (!skills.length) return;

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
        client.println(result.join("\n"));
    }

    function formatSkill(
        { name, level }: { name: string; level: string },
        maxName: number,
        maxLevel: number
    ) {
        const colored = colorLevel(level);
        const n = pad(name, maxName);
        const l = pad(colored, maxLevel);
        return `${n}: ${l}`;
    }

    function startTimer() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(finish, 1000);
    }

    function run() {
        lines = [];
        client.Triggers.removeByTag(tag);
        client.Triggers.registerTrigger(
            /.*/,
            (_raw, line) => {
                if (!/[^:]+:\s+\S+/.test(line)) return undefined;
                lines.push(line);
                startTimer();
                return SKIP_LINE;
            },
            tag,
            { stayOpenLines: 50 }
        );
        client.sendCommand("um");
        startTimer();
    }

    if (aliases) {
        aliases.push({ pattern: /^\/um$/, callback: run });
    }
}
