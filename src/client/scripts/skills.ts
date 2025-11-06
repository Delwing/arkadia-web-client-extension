import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";
import { stripAnsiCodes } from "../Triggers";
import {AnsiAwareBuffer, FormatStateSnapshot} from "../ansi/FormatState";

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

function colorLevel(level: string, maxLevel: number): AnsiAwareBuffer {
    const num = skillsDesc[level.toLowerCase()];
    const bracketWidth = "[10/10]".length;
    if (!num) {
        return new AnsiAwareBuffer(pad(level, maxLevel + 1 + bracketWidth));
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
        maxLevel: number,
        originalFormatting?: FormatStateSnapshot
    ): AnsiAwareBuffer {
        const n = pad(`${name}:`, maxName + 1);
        const l = colorLevel(level, maxLevel);
        const result = new AnsiAwareBuffer(n, originalFormatting);
        result.append(" ", originalFormatting);
        result.appendBuffer(l);
        return result;
    }

    function process(raw: string, originalFormatting?: FormatStateSnapshot): AnsiAwareBuffer {
        const lines = raw.split("\n").filter((l) => /[^:]+:\s+\S+/.test(stripAnsiCodes(l)));
        const skills: { name: string; level: string }[] = [];
        lines.forEach((l) => {
            const pairs = l.match(/[^:]+:\s+\S+/g);
            pairs?.forEach((p) => {
                const m = p.match(/([^:]+):\s+(\S+)/);
                if (m) skills.push({ name: m[1].trim(), level: m[2].trim() });
            });
        });
        if (!skills.length) return new AnsiAwareBuffer(raw);

        const maxName = Math.max(...skills.map((s) => s.name.length));
        const maxLevel = Math.max(...skills.map((s) => s.level.length));
        const result = new AnsiAwareBuffer();
        for (let i = 0; i < skills.length; i += 2) {
            if (i > 0) {
                result.append("\n", originalFormatting);
            }
            const col1 = formatSkill(skills[i], maxName, maxLevel, originalFormatting);
            if (i + 1 < skills.length) {
                const col2 = formatSkill(skills[i + 1], maxName, maxLevel, originalFormatting);
                const combined = col1.clone();
                combined.append("  ", originalFormatting);
                combined.appendBuffer(col2);
                if (
                    client.contentWidth &&
                    combined.text.length > client.contentWidth
                ) {
                    result.appendBuffer(col1);
                    result.append("\n", originalFormatting);
                    result.appendBuffer(col2);
                } else {
                    result.appendBuffer(combined);
                }
            } else {
                result.appendBuffer(col1);
            }
        }
        return result;
    }

    function run() {
        disable();
        client.Triggers.registerMultilineTrigger(
            /[^:]+:\s+\S+/,
            (line) => {
                const raw = line.text;
                const originalFormatting = line.getStateAt(0);
                const out = process(raw, originalFormatting);
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
