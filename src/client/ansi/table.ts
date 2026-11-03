import {AnsiAwareBuffer, TextSelection} from "./FormatState";
import type {StyleInput} from "./FormatState";

/** Anything a table cell (or a print) can hold: text, a number, a line made with `api.text`, or a selection in one */
export type TextInput = string | number | AnsiAwareBuffer | TextSelection | null | undefined;

/** A table column: its header and how its cells line up */
export interface TableColumn {
    header?: TextInput;
    /** Defaults to 'left' */
    align?: "left" | "right" | "center";
}

/** What to draw with `api.output.table` */
export interface TableOptions {
    /** Shown centred above the columns */
    title?: TextInput;
    /** Column headers (or `{ header, align }`); leave out for a table without a header row */
    columns?: (string | TableColumn)[];
    /** The cells, row by row. A cell may span several lines (`\n`) and wraps when the table must narrow. */
    rows: TextInput[][];
    /** Widest the table may be, frame included. Defaults to the console width. */
    maxWidth?: number;
    /** Formatting laid over the title, the header cells and the frame */
    styles?: { title?: StyleInput; header?: StyleInput; border?: StyleInput };
}

const PAD = 1;
const MIN_COLUMN = 3;

/** Turns any text input into a buffer of its own (a buffer passed in is copied, never changed). */
export function toLine(input: TextInput): AnsiAwareBuffer {
    if (input === null || input === undefined) return new AnsiAwareBuffer();
    if (input instanceof TextSelection) return input.line.clone();
    if (input instanceof AnsiAwareBuffer) return input.clone();
    return new AnsiAwareBuffer(String(input));
}

function styled(line: AnsiAwareBuffer, style?: StyleInput): AnsiAwareBuffer {
    if (style && line.length > 0) line.select().style(style);
    return line;
}

/**
 * Draws a table in the client's own frame:
 * ```
 * /-----------------\
 * |  Zestawy ziol   |
 * +---------+-------+
 * | Nazwa   | Ilosc |
 * +---------+-------+
 * | leczace |     3 |
 * \-----------------/
 * ```
 * Columns are as wide as their content; when the table is wider than
 * `maxWidth` (or `availableWidth`), the widest columns narrow and their cells
 * wrap. Cells keep their formatting and links; padding and frame never pick
 * them up.
 */
export function renderTable(options: TableOptions, availableWidth = 0): AnsiAwareBuffer {
    const columns: TableColumn[] = (options.columns ?? []).map(c => typeof c === "string" ? {header: c} : c);
    const count = Math.max(1, columns.length, ...options.rows.map(r => r.length));
    const hasHeader = columns.some(c => c.header !== undefined && c.header !== null);
    const header = Array.from({length: count}, (_, i) => styled(toLine(columns[i]?.header), options.styles?.header));
    const rows = options.rows.map(row => Array.from({length: count}, (_, i) => toLine(row[i])));
    const title = options.title === undefined || options.title === null
        ? undefined
        : styled(toLine(options.title), options.styles?.title);

    const longestLine = (line: AnsiAwareBuffer) => Math.max(0, ...line.splitLines().map(l => l.length));
    const widths = Array.from({length: count}, (_, i) => Math.max(
        hasHeader ? longestLine(header[i]) : 0,
        ...rows.map(r => longestLine(r[i])),
        1,
    ));
    const inner = () => widths.reduce((sum, w) => sum + w + 2 * PAD, 0) + count - 1;

    // Room for the title: widen the last column.
    if (title) {
        const need = longestLine(title) + 2 * PAD;
        if (inner() < need) widths[count - 1] += need - inner();
    }

    // Too wide: narrow the widest column a step at a time.
    const limit = options.maxWidth ?? availableWidth;
    if (limit > 0) {
        while (inner() + 2 > limit) {
            const widest = widths.indexOf(Math.max(...widths));
            if (widths[widest] <= MIN_COLUMN) break;
            widths[widest]--;
        }
    }

    const border = (text: string) => new AnsiAwareBuffer(text, options.styles?.border ?? {});
    const output = new AnsiAwareBuffer();
    const emit = (line: AnsiAwareBuffer) => {
        if (output.length > 0) output.append("\n", {});
        output.appendBuffer(line);
    };
    const rule = (left: string, right: string) => emit(border(`${left}${"-".repeat(inner())}${right}`));
    const joints = () => emit(border(`+${widths.map(w => "-".repeat(w + 2 * PAD)).join("+")}+`));
    const row = (cells: AnsiAwareBuffer[]) => {
        const lines = cells.map((cell, i) => cell.wrap(widths[i]));
        const height = Math.max(1, ...lines.map(l => l.length));
        for (let k = 0; k < height; k++) {
            const line = border("|");
            lines.forEach((cellLines, i) => {
                const text = cellLines[k]?.truncate(widths[i]) ?? new AnsiAwareBuffer();
                const align = columns[i]?.align ?? "left";
                if (align === "right") text.padStart(widths[i]);
                else if (align === "center") text.center(widths[i]);
                else text.padEnd(widths[i]);
                line.append(" ".repeat(PAD), {}).appendBuffer(text).append(" ".repeat(PAD), {}).appendBuffer(border("|"));
            });
            emit(line);
        }
    };

    rule("/", "\\");
    if (title) {
        for (const titleLine of title.wrap(inner() - 2 * PAD)) {
            emit(border("|").appendBuffer(titleLine.center(inner())).appendBuffer(border("|")));
        }
        if (hasHeader || rows.length > 0) joints();
    }
    if (hasHeader) {
        row(header);
        if (rows.length > 0) joints();
    }
    rows.forEach(row);
    rule("\\", "/");
    return output;
}
