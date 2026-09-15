import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import {AnsiAwareBuffer, FormatStateSnapshot} from "../ansi/FormatState";
import {findTableRange, lineOffset} from "./skillTable";

const COLORS = [
    createColorFormat("#ff0000"),
    createColorFormat("#ff0000"),
    createColorFormat("#ff0000"),
    createColorFormat("#ffa500"),
    createColorFormat("#ffa500"),
    createColorFormat("#ffff00"),
    createColorFormat("#ffff00"),
    createColorFormat("#00ff00"),
    createColorFormat("#00ff00"),
    createColorFormat("#87ceeb"),
];

const MODS_MINUS = createColorFormat("#ff6b6b");
const MODS_PLUS = createColorFormat("#5fd75f");
const MODS_NEUTRAL = createColorFormat("#aaaaaa");

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

interface Skill {
    name: string;
    level: string;
    /** Situational modifiers the game appends, normalised to `(-teren)`; empty when none. */
    mods: string;
}

/**
 * Every `nazwa: poziom` entry on a line — a row may carry two columns, and an entry may be
 * trailed by parenthesised modifiers (`skradanie sie: ledwo ( -teren )`). Skill names hold
 * no parentheses, which is what lets one column's modifiers be told apart from the name of
 * the next.
 */
const SKILL_ENTRY = /([^:()]+):[ \t]+(\S+)((?:[ \t]*\([^)]*\))*)/g;

function skillPairs(line: string): Skill[] {
    return [...line.matchAll(SKILL_ENTRY)].map((m) => ({
        name: m[1].trim(),
        level: m[2].trim(),
        mods: normaliseMods(m[3]),
    }));
}

/** `  ( -teren )  ( +noc )` -> `(-teren) (+noc)`. */
function normaliseMods(mods: string): string {
    return (mods.match(/\([^)]*\)/g) ?? [])
        .map((mod) => `(${mod.slice(1, -1).trim().replace(/\s+/g, " ")})`)
        .join(" ");
}

/**
 * Whether a line is a row of the `um` table. The level vocabulary is what decides it: the
 * `nazwa: wartosc` shape alone would also accept "Zorlan mowi: czesc", and a line the game
 * flushed alongside the table must not be mistaken for part of it. One known level on the
 * line is enough, so a skill whose level word we don't recognise still renders as long as
 * it shares a row with one we do.
 */
function isSkillRow(line: string): boolean {
    return skillPairs(line).some((p) => skillsDesc[p.level.toLowerCase()] !== undefined);
}

function pad(str: string, len: number) {
    return str + " ".repeat(Math.max(0, len - str.length));
}

/**
 * Modifiers read as a penalty or a bonus, so they are coloured by sign; a group that mixes
 * the two, or carries neither, stays neutral rather than claiming something it cannot tell.
 */
function modsColor(mods: string): FormatStateSnapshot {
    const minus = mods.includes("-");
    const plus = mods.includes("+");
    if (minus && !plus) return MODS_MINUS;
    if (plus && !minus) return MODS_PLUS;
    return MODS_NEUTRAL;
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

    /**
     * `padMods` fills the modifier field out to the table's widest one, so that a left
     * column keeps the right one aligned. The rightmost column leaves it off — nothing
     * follows it, and padding there would only trail whitespace across the screen.
     */
    function formatSkill(
        { name, level, mods }: Skill,
        maxName: number,
        maxLevel: number,
        maxMods: number,
        padMods: boolean,
        originalFormatting?: FormatStateSnapshot
    ): AnsiAwareBuffer {
        const n = pad(`${name}:`, maxName + 1);
        const l = colorLevel(level, maxLevel);
        const result = new AnsiAwareBuffer(n, originalFormatting);
        result.append(" ", originalFormatting);
        result.appendBuffer(l);
        if (maxMods && (mods || padMods)) {
            result.append(" ", originalFormatting);
            if (mods) {
                result.appendBuffer(colorString(mods, modsColor(mods)));
            }
            if (padMods) {
                result.append(" ".repeat(maxMods - mods.length), originalFormatting);
            }
        }
        return result;
    }

    /**
     * Reformat the `um` table found in a frame, or null when the frame holds none.
     * Anything the game flushed alongside the table is passed through untouched — see
     * {@link findTableRange}.
     */
    function process(line: AnsiAwareBuffer): AnsiAwareBuffer | null {
        const parts = line.splitLines();
        const lines = parts.map((p) => p.text);
        const range = findTableRange(lines, isSkillRow);
        if (!range) return null;

        const skills = lines.slice(range.start, range.end).flatMap(skillPairs);
        if (!skills.length) return null;

        // Style the rebuilt table after the state the table itself started in, not after
        // whatever line happened to share the frame ahead of it.
        const originalFormatting = line.getStateAt(lineOffset(lines, range.start));

        const maxName = Math.max(...skills.map((s) => s.name.length));
        const maxLevel = Math.max(...skills.map((s) => s.level.length));
        const maxMods = Math.max(...skills.map((s) => s.mods.length));
        const table = new AnsiAwareBuffer();
        for (let i = 0; i < skills.length; i += 2) {
            if (i > 0) {
                table.append("\n", originalFormatting);
            }
            const col1 = formatSkill(skills[i], maxName, maxLevel, maxMods, false, originalFormatting);
            if (i + 1 < skills.length) {
                const col2 = formatSkill(skills[i + 1], maxName, maxLevel, maxMods, false, originalFormatting);
                const combined = formatSkill(skills[i], maxName, maxLevel, maxMods, true, originalFormatting);
                combined.append("  ", originalFormatting);
                combined.appendBuffer(col2);
                if (
                    client.contentWidth &&
                    combined.text.length > client.contentWidth
                ) {
                    table.appendBuffer(col1);
                    table.append("\n", originalFormatting);
                    table.appendBuffer(col2);
                } else {
                    table.appendBuffer(combined);
                }
            } else {
                table.appendBuffer(col1);
            }
        }

        if (range.start === 0 && range.end === parts.length) {
            return table;
        }

        const result = new AnsiAwareBuffer();
        for (let i = 0; i < range.start; i++) {
            result.appendBuffer(parts[i]);
            result.append("\n", originalFormatting);
        }
        result.appendBuffer(table);
        for (let i = range.end; i < parts.length; i++) {
            result.append("\n", originalFormatting);
            result.appendBuffer(parts[i]);
        }
        return result;
    }

    function run() {
        disable();
        client.Triggers.registerMultilineTrigger(
            /[^:]+:\s+\S+/,
            (line) => {
                const out = process(line);
                // Something colon-shaped that isn't the table beat the reply into the
                // frame; keep the one shot for the table itself (the timeout still ends it).
                if (!out) return line;
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
