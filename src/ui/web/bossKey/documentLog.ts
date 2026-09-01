/**
 * Turns raw game output into the body of the fake Word document.
 *
 * The document shows the real transcript so the player can keep reading the game
 * while the client is hidden, which means **readability wins over prose**. An
 * earlier version reflowed runs of lines into justified paragraphs; it looked
 * more like a report but destroyed everything the game relies on line structure
 * for -- combat exchanges, inventory and item lists, tells, tables. So lines are
 * kept as lines, exactly as the game sent them:
 *
 * - One output line becomes one document line, with its leading whitespace
 *   intact (the renderer sets `white-space: pre-wrap`), so indented listings
 *   still read as listings.
 * - Blank lines are kept, since the game uses them to separate blocks.
 * - `room.short` (the location name) becomes a heading -- that is both what a
 *   document looks like AND genuinely useful: your headings are your rooms.
 *
 * Pure functions, so the shaping is testable without a DOM.
 */

/** One captured output line, already reduced to plain text. */
export interface LogLine {
    text: string;
    type?: string;
}

export type DocBlockKind = "heading" | "line" | "blank";

export interface DocBlock {
    kind: DocBlockKind;
    text: string;
}

/**
 * How many output lines the document keeps.
 *
 * Only the tail is ever on screen (the page auto-scrolls to the end), and this
 * caps the work `buildDocumentBlocks` does on each burst of output.
 */
export const MAX_DOCUMENT_LINES = 300;

/** Append `line` to a capped rolling buffer, mutating and returning it. */
export function pushLine(buffer: LogLine[], line: LogLine): LogLine[] {
    buffer.push(line);
    if (buffer.length > MAX_DOCUMENT_LINES) {
        buffer.splice(0, buffer.length - MAX_DOCUMENT_LINES);
    }
    return buffer;
}

/** Shape captured lines into document blocks. See the module comment. */
export function buildDocumentBlocks(lines: readonly LogLine[]): DocBlock[] {
    const blocks: DocBlock[] = [];

    for (const line of lines) {
        if (line.type === "room.short") {
            const name = line.text.trim();
            if (name) blocks.push({ kind: "heading", text: name });
            continue;
        }

        if (line.text.trim() === "") {
            // Never open the page on blank space -- the buffer's head is an
            // arbitrary cut, not a real gap in the transcript.
            if (blocks.length === 0) continue;
            blocks.push({ kind: "blank", text: "" });
            continue;
        }

        // Not trimmed: leading spaces carry the game's own alignment.
        blocks.push({ kind: "line", text: line.text });
    }

    return blocks;
}
