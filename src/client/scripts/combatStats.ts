import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import {AnsiAwareBuffer, FormatStateSnapshot} from "../ansi/FormatState";
import {createColorFormat} from "@modules/core/Colors";

const COLOR_BORDER: FormatStateSnapshot = createColorFormat('#C0C0C0');
const COLOR_DIM: FormatStateSnapshot = createColorFormat('#BEBEBE');
const COLOR_HEADER: FormatStateSnapshot = createColorFormat('#FFFF00');
const COLOR_LABEL: FormatStateSnapshot = createColorFormat('#8470FF');
const COLOR_TITLE: FormatStateSnapshot = createColorFormat('#00FF00');

export type BodyPart = "glowa" | "ramiona" | "korpus" | "nogi";

export interface CombatStatsSnapshot {
    total: number;
    otrzymane: { count: number; parts: Record<BodyPart, number> };
    wyparowane: {
        count: number;
        bron: number;
        zbroje: { count: number; parts: Record<BodyPart, number> };
        tarcze: number;
    };
    unikniete: number;
}

const BODY_PARTS: BodyPart[] = ["glowa", "ramiona", "korpus", "nogi"];

function emptyParts(): Record<BodyPart, number> {
    return { glowa: 0, ramiona: 0, korpus: 0, nogi: 0 };
}

function emptySnapshot(): CombatStatsSnapshot {
    return {
        total: 0,
        otrzymane: { count: 0, parts: emptyParts() },
        wyparowane: {
            count: 0,
            bron: 0,
            zbroje: { count: 0, parts: emptyParts() },
            tarcze: 0,
        },
        unikniete: 0,
    };
}

const stats: CombatStatsSnapshot = emptySnapshot();

function detectBodyPart(text: string): BodyPart | null {
    if (/prawe ramie|lewe ramie/i.test(text)) return "ramiona";
    if (/korpus/i.test(text)) return "korpus";
    if (/glowe/i.test(text)) return "glowa";
    if (/nogi/i.test(text)) return "nogi";
    return null;
}

function classifyParowanie(prefix: string): "bron" | "zbroje" | "tarcze" {
    const p = prefix.trim().toLowerCase();
    if (p.startsWith("zbr")) return "zbroje";
    if (p.startsWith("tar")) return "tarcze";
    return "bron";
}

export function recordCombatStat(prefix: string, type: string, text: string): void {
    let changed = false;

    if (type === "innych_ciosy_we_mnie") {
        stats.otrzymane.count++;
        const part = detectBodyPart(text);
        if (part) stats.otrzymane.parts[part]++;
        changed = true;
    } else if (type === "moje_parowanie") {
        const kind = classifyParowanie(prefix);
        stats.wyparowane.count++;
        if (kind === "bron") {
            stats.wyparowane.bron++;
        } else if (kind === "tarcze") {
            stats.wyparowane.tarcze++;
        } else {
            stats.wyparowane.zbroje.count++;
            const part = detectBodyPart(text);
            if (part) stats.wyparowane.zbroje.parts[part]++;
        }
        changed = true;
    } else if (type === "moje_uniki") {
        stats.unikniete++;
        changed = true;
    }

    if (changed) {
        stats.total =
            stats.otrzymane.count + stats.wyparowane.count + stats.unikniete;
        eventBus.emit("stat.updated", getCombatStats());
    }
}

export function getCombatStats(): CombatStatsSnapshot {
    return JSON.parse(JSON.stringify(stats));
}

function resetStats(): void {
    const fresh = emptySnapshot();
    stats.total = fresh.total;
    stats.otrzymane = fresh.otrzymane;
    stats.wyparowane = fresh.wyparowane;
    stats.unikniete = fresh.unikniete;
}

function pct(part: number, whole: number): string {
    if (whole <= 0) return "0%";
    return `${Math.round((part / whole) * 100)}%`;
}

const BODY_LABELS: Record<BodyPart, string> = {
    glowa: "glowa",
    ramiona: "ramiona",
    korpus: "korpus",
    nogi: "nogi",
};

const INNER = 53;
const LEFT_PAD = 3;
const RIGHT_PAD = 1;
const INNER_TOTAL = INNER + LEFT_PAD + RIGHT_PAD;
const LEFT_SPACES = " ".repeat(LEFT_PAD);
const RIGHT_SPACES = " ".repeat(RIGHT_PAD);
const VALUE_COL_DEFAULT = 36;
// Column (within INNER) where the last char of every value lands, so closing
// parentheses line up vertically across all rows, including the combined ones.
const VALUE_CLOSE_COL = 41;

type Segment = [text: string, color: FormatStateSnapshot];

function alignedTail(prefixLen: number, value: string, valueCol: number): string {
    // Inner layout after prefix: ":" + " " + dots + " " + value + trailing
    // Value starts at content column valueCol; chars before value = prefixLen + 3 + dotsCount
    const dotsCount = Math.max(2, valueCol - prefixLen - 3);
    const used = prefixLen + 3 + dotsCount + value.length;
    const trailing = " ".repeat(Math.max(0, INNER - used));
    return `: ${".".repeat(dotsCount)} ${value}${trailing}${RIGHT_SPACES}|`;
}

function alignedTailRight(prefixLen: number, value: string): string {
    // Right-align value so its last char lands at VALUE_CLOSE_COL.
    const start = VALUE_CLOSE_COL - value.length + 1;
    const dotsCount = Math.max(2, start - prefixLen - 3);
    const used = prefixLen + 3 + dotsCount + value.length;
    const trailing = " ".repeat(Math.max(0, INNER - used));
    return `: ${".".repeat(dotsCount)} ${value}${trailing}${RIGHT_SPACES}|`;
}

function statRowSegments(label: string, value: string): Segment[] {
    const labelPrefix = `  » ${label}`;
    return [
        [`|${LEFT_SPACES}${"  » "}`, COLOR_BORDER],
        [label, COLOR_LABEL],
        [alignedTailRight(labelPrefix.length, value), COLOR_DIM],
    ];
}

function headingRowSegments(header: string, rest: string): Segment[] {
    const content = `${header}${rest}`;
    const padding = " ".repeat(Math.max(0, INNER - content.length));
    return [
        [`|${LEFT_SPACES}`, COLOR_BORDER],
        [header, COLOR_HEADER],
        [`${rest}${padding}${RIGHT_SPACES}|`, COLOR_DIM],
    ];
}

function totalRowSegments(value: number, valueCol = VALUE_COL_DEFAULT): Segment[] {
    const prefix = `WSZYSTKIE ciosy`;
    return [
        [`|${LEFT_SPACES}`, COLOR_BORDER],
        [`WSZYSTKIE`, COLOR_HEADER],
        [` ciosy`, COLOR_DIM],
        [alignedTail(prefix.length, String(value), valueCol), COLOR_DIM],
    ];
}

function combinedHeadingSegments(): Segment[] {
    const h1 = "OTRZYMANE";
    const mid = " na czesci ciala/";
    const h2 = "WYPAROWANE";
    const tail = " przez zbroje";
    const content = `${h1}${mid}${h2}${tail}`;
    const padding = " ".repeat(Math.max(0, INNER - content.length));
    return [
        [`|${LEFT_SPACES}`, COLOR_BORDER],
        [h1, COLOR_HEADER],
        [mid, COLOR_DIM],
        [h2, COLOR_HEADER],
        [`${tail}${padding}${RIGHT_SPACES}|`, COLOR_DIM],
    ];
}

function blankRowSegments(): Segment[] {
    return [[`|${" ".repeat(INNER_TOTAL)}|`, COLOR_BORDER]];
}

function titleBorderSegments(): Segment[] {
    const title = "Statystyki";
    const totalDashes = INNER_TOTAL - title.length - 2;
    const leftDashes = Math.floor(totalDashes / 2);
    const rightDashes = totalDashes - leftDashes;
    return [
        [`+${"-".repeat(leftDashes)} `, COLOR_BORDER],
        [title, COLOR_TITLE],
        [` ${"-".repeat(rightDashes)}+`, COLOR_DIM],
    ];
}

function bottomBorderSegments(): Segment[] {
    return [[`+${"-".repeat(INNER_TOTAL)}+`, COLOR_BORDER]];
}

function buildPanel(s: CombatStatsSnapshot): AnsiAwareBuffer {
    const lines: Segment[][] = [];

    lines.push(titleBorderSegments());
    lines.push(blankRowSegments());

    lines.push(totalRowSegments(s.total));
    lines.push(blankRowSegments());

    lines.push(headingRowSegments("OGOLEM", " ciosy"));
    lines.push(statRowSegments("otrzymane", `${s.otrzymane.count} (${pct(s.otrzymane.count, s.total)})`));
    lines.push(statRowSegments("wyparowane", `${s.wyparowane.count} (${pct(s.wyparowane.count, s.total)})`));
    lines.push(statRowSegments("unikniete", `${s.unikniete} (${pct(s.unikniete, s.total)})`));
    lines.push(blankRowSegments());

    lines.push(headingRowSegments("OTRZYMANE", " ciosy na czesci ciala"));
    BODY_PARTS.forEach((p) => {
        const v = s.otrzymane.parts[p];
        lines.push(statRowSegments(BODY_LABELS[p], `${v} (${pct(v, s.otrzymane.count)})`));
    });
    lines.push(blankRowSegments());

    lines.push(headingRowSegments("WYPAROWANE", " ciosy przez"));
    lines.push(statRowSegments("bron", `${s.wyparowane.bron} (${pct(s.wyparowane.bron, s.wyparowane.count)})`));
    lines.push(statRowSegments("zbroje", `${s.wyparowane.zbroje.count} (${pct(s.wyparowane.zbroje.count, s.wyparowane.count)})`));
    lines.push(statRowSegments("tarcze", `${s.wyparowane.tarcze} (${pct(s.wyparowane.tarcze, s.wyparowane.count)})`));
    lines.push(blankRowSegments());

    lines.push(headingRowSegments("WYPAROWANE", " ciosy przez zbroje"));
    BODY_PARTS.forEach((p) => {
        const v = s.wyparowane.zbroje.parts[p];
        lines.push(statRowSegments(BODY_LABELS[p], `${v} (${pct(v, s.wyparowane.zbroje.count)})`));
    });
    lines.push(blankRowSegments());

    lines.push(combinedHeadingSegments());
    const recvCell = (p: BodyPart) => {
        const v = s.otrzymane.parts[p];
        return `${v} (${pct(v, v + s.wyparowane.zbroje.parts[p])})`;
    };
    const parCell = (p: BodyPart) => {
        const v = s.wyparowane.zbroje.parts[p];
        return `${v} (${pct(v, s.otrzymane.parts[p] + v)})`;
    };
    const recvWidth = Math.max(...BODY_PARTS.map((p) => recvCell(p).length));
    const parWidth = Math.max(...BODY_PARTS.map((p) => parCell(p).length));
    BODY_PARTS.forEach((p) => {
        const text = `${recvCell(p).padStart(recvWidth)} / ${parCell(p).padStart(parWidth)}`;
        lines.push(statRowSegments(BODY_LABELS[p], text));
    });
    lines.push(blankRowSegments());

    lines.push(bottomBorderSegments());

    const buf = new AnsiAwareBuffer("");
    lines.forEach((segs, i) => {
        if (i > 0) buf.append("\n");
        segs.forEach(([text, color]) => buf.append(text, color));
    });
    return buf;
}

type AliasList = { push: (alias: { pattern: RegExp; callback: () => void }) => void };

export default function initCombatStats(
    client: Client,
    aliases: AliasList
): void {
    aliases.push({
        pattern: /^\/stat$/,
        callback: () => {
            const panel = buildPanel(stats);
            panel.prepend("\n\n");
            panel.append("\n\n");
            client.print(panel);
        },
    });

    aliases.push({
        pattern: /^\/statw$/,
        callback: () => {
            eventBus.emit("stat.popup.open");
        },
    });

    client.on("reset", () => {
        resetStats();
        eventBus.emit("stat.cleared");
    });
}
