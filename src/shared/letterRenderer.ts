import type { LetterTemplate } from "@client/types/letter";

export const MIN_LINE_WIDTH = 20;
export const MAX_LINE_WIDTH = 120;
export const DEFAULT_LINE_WIDTH = 60;

export function clampLineWidth(width: number): number {
    const rounded = Math.round(width);
    return Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, rounded));
}

function normalizeLine(line: string): string {
    return line.replace(/\s+/g, " ").trim();
}

function splitLongWord(word: string, width: number): string[] {
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += width) {
        parts.push(word.slice(i, i + width));
    }
    return parts;
}

export type LetterAlignment = "justify" | "left" | "center" | "right";

/**
 * A body line starting with one of these characters is aligned that way
 * (the character itself is not sent); lines without a marker are justified.
 * A backslash before the marker keeps it as text.
 */
export const LETTER_ALIGNMENT_MARKERS: Readonly<Record<LetterAlignment, string>> = {
    justify: "=",
    left: "<",
    center: "^",
    right: ">",
};

const MARKER_ALIGNMENTS: Readonly<Record<string, LetterAlignment>> = {
    "=": "justify",
    "<": "left",
    "^": "center",
    ">": "right",
};

const DEFAULT_ALIGNMENT: LetterAlignment = "justify";

/** The alignment a line asks for and its text without the marker. */
export function parseAlignedLine(line: string): { alignment: LetterAlignment; text: string } {
    const marker = line.charAt(0);
    const alignment = MARKER_ALIGNMENTS[marker];
    if (alignment) {
        return { alignment, text: line.slice(1).trim() };
    }
    if (marker === "\\" && MARKER_ALIGNMENTS[line.charAt(1)]) {
        return { alignment: DEFAULT_ALIGNMENT, text: line.slice(1) };
    }
    return { alignment: DEFAULT_ALIGNMENT, text: line };
}

/** `line` with its alignment marker set to `alignment` (none for the default). */
export function setLineAlignment(line: string, alignment: LetterAlignment): string {
    const leading = line.match(/^\s*/)?.[0] ?? "";
    const rest = line.slice(leading.length);
    const text = MARKER_ALIGNMENTS[rest.charAt(0)] ? rest.slice(1).replace(/^\s+/, "") : rest;
    return alignment === DEFAULT_ALIGNMENT ? `${leading}${text}` : `${leading}${LETTER_ALIGNMENT_MARKERS[alignment]}${text}`;
}

function justifyWords(words: string[], lettersLength: number, width: number): string {
    if (words.length === 1) {
        return words[0];
    }
    const gaps = words.length - 1;
    const totalSpaces = width - lettersLength;
    const baseSpace = Math.max(1, Math.floor(totalSpaces / gaps));
    let extra = totalSpaces - baseSpace * gaps;
    let line = words[0];
    for (let i = 1; i < words.length; i += 1) {
        let spaces = baseSpace;
        if (extra > 0) {
            spaces += 1;
            extra -= 1;
        }
        line += " ".repeat(spaces) + words[i];
    }
    return line;
}

function alignWords(words: string[], width: number, alignment: LetterAlignment, isLastLine: boolean): string {
    if (alignment === "justify" && !isLastLine) {
        return justifyWords(words, words.reduce((sum, word) => sum + word.length, 0), width);
    }
    const text = words.join(" ");
    if (alignment === "right") {
        return text.padStart(width, " ");
    }
    if (alignment === "center") {
        return " ".repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;
    }
    return text;
}

/** Words of a line grouped into lines of at most `width` characters. */
function wrapWords(normalizedLine: string, width: number): string[][] {
    if (!normalizedLine) {
        return [];
    }
    const groups: string[][] = [];
    let currentWords: string[] = [];
    let lettersLength = 0;

    const flush = () => {
        if (currentWords.length) {
            groups.push(currentWords);
        }
        currentWords = [];
        lettersLength = 0;
    };

    normalizedLine.split(" ").forEach(word => {
        if (word.length > width) {
            flush();
            const parts = splitLongWord(word, width);
            const lastPart = parts.pop();
            parts.forEach(part => groups.push([part]));
            if (lastPart) {
                currentWords = [lastPart];
                lettersLength = lastPart.length;
            }
            return;
        }

        const minimalSpaces = currentWords.length;
        if (lettersLength + word.length + minimalSpaces > width && currentWords.length) {
            flush();
        }

        currentWords.push(word);
        lettersLength += word.length;
    });

    flush();

    return groups;
}

function wrapLine(line: string, width: number): string[] {
    const { alignment, text } = parseAlignedLine(line);
    const groups = wrapWords(normalizeLine(text), width);
    return groups.map((words, index) => alignWords(words, width, alignment, index === groups.length - 1));
}

function formatContent(content: string, width: number): string[] {
    const rawLines = content.split(/\r?\n/);
    const result: string[] = [];
    let pendingBlankLine = false;
    let hasContent = false;

    rawLines.forEach(line => {
        const wrapped = wrapLine(normalizeLine(line), width);
        if (!wrapped.length) {
            if (hasContent) {
                pendingBlankLine = true;
            }
            return;
        }

        if (pendingBlankLine && result.length) {
            result.push("");
            pendingBlankLine = false;
        }

        result.push(...wrapped);
        hasContent = true;
    });

    return result;
}

/**
 * How a letter is framed. Header and footer lines are written as-is, except
 * that `{...}` repeats the text in braces to exactly the body width (cut
 * mid-pattern when it does not divide evenly),
 * so the frame grows with the line width. Body lines go between the prefix
 * and the suffix; a prefix or suffix of several lines (separated by `\n`)
 * is used line by line, starting over after the last one.
 */
export interface LetterLayout {
    header: readonly string[];
    footer: readonly string[];
    bodyPrefix: string;
    bodySuffix: string;
    /** Send the content exactly as typed: no wrapping, no frame. */
    raw?: boolean;
}

const FILL_PATTERN = /\{([^{}]+)\}/g;

export function expandFillLine(line: string, width: number): string {
    return line.replace(FILL_PATTERN, (_match, pattern: string) =>
        pattern.repeat(Math.ceil(width / pattern.length)).slice(0, width));
}

/** The lines of a body prefix or suffix, without trailing empty ones. */
export function splitBodyPattern(pattern: string): string[] {
    const lines = pattern.split(/\r?\n/);
    while (lines.length > 1 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    return lines;
}

function longestLength(lines: readonly string[]): number {
    return lines.reduce((max, line) => Math.max(max, line.length), 0);
}

/** Body width left inside the frame for a total line width. */
export function getLayoutBodyWidth(layout: LetterLayout, totalWidth: number): number {
    if (layout.raw) {
        return Infinity;
    }
    const prefixWidth = longestLength(splitBodyPattern(layout.bodyPrefix));
    const suffixWidth = longestLength(splitBodyPattern(layout.bodySuffix));
    return Math.max(1, totalWidth - prefixWidth - suffixWidth);
}

function formatBody(layout: LetterLayout, lines: readonly string[], width: number): string[] {
    if (layout.raw) {
        return [...lines];
    }
    const prefixes = splitBodyPattern(layout.bodyPrefix);
    const suffixes = splitBodyPattern(layout.bodySuffix);
    // Shorter prefixes are padded so the text keeps one column
    const prefixWidth = longestLength(prefixes);
    const framed = prefixWidth > 0 || longestLength(suffixes) > 0;
    return lines.map((line, index) => {
        const trimmed = line.length > width ? line.slice(0, width) : line;
        if (!framed) {
            return trimmed.trimEnd();
        }
        const prefix = prefixes[index % prefixes.length].padEnd(prefixWidth, " ");
        const suffix = suffixes[index % suffixes.length];
        return `${prefix}${trimmed.padEnd(width, " ")}${suffix}`;
    });
}

export const BUILTIN_LETTER_LAYOUTS: Readonly<Record<LetterTemplate, LetterLayout>> = {
    none: {
        header: [],
        footer: [],
        bodyPrefix: "",
        bodySuffix: "",
    },
    plain: {
        header: [
            " +--{-}--+ ",
            " |  { }  | ",
            " |  { }  | ",
        ],
        footer: [
            " |  { }  | ",
            " |  { }  | ",
            " +--{-}--+ ",
        ],
        bodyPrefix: " |  ",
        bodySuffix: "  | ",
    },
    parchment: {
        header: [
            "  ____{_}___  ",
            "/ \\   { }   \\.",
            "|  |  { }   |.",
            "\\_ |  { }   |.",
            "   |  { }   |.",
        ],
        footer: [
            "   |  { }   |.   ",
            "   |   {_}__|___ ",
            "   |  /{ }     /.",
            "   \\_/_{_}____/. ",
        ],
        bodyPrefix: "   |   ",
        bodySuffix: "  |.",
    },
    parchment2: {
        header: [
            " ______{_}_____  ",
            " / _\\  { }     \\ ",
            "|/ >|  { }     | ",
            " |\\_/__{_}______/",
            " \\.    { }   ./  ",
            " |     { }   |   ",
        ],
        footer: [
            " |  ___{_}___|   ",
            " |/\\   { }     \\ ",
            " \\_|   { }      |",
            "  \\_/_ {_}_____/ ",
        ],
        bodyPrefix: " |     ",
        bodySuffix: "   |   ",
    },
    parchment3: {
        header: [
            "             { }  .---.   ",
            "             { } /  .  \\ ",
            "             { }|\\_/|   |",
            "             { }|   |  /| ",
            "   .---------{-}-------'|",
            "  /  .-.     { }        | ",
            " |  /   \\   { }         |",
            " | |\\_.  |  { }         |",
            " |\\|  | /|  { }         |",
            " | `---' |  { }         |",
        ],
        footer: [
            " |       |   { }        /   ",
            " |       |---{-}--------' ",
            " \\       |  { }            ",
            " \\.___./    { }            ",
        ],
        bodyPrefix: " |       |   ",
        bodySuffix: "        | ",
    },
    raw: {
        header: [],
        footer: [],
        bodyPrefix: "",
        bodySuffix: "",
        raw: true,
    },
};

export interface LetterRenderResult {
    lines: string[];
    hasContent: boolean;
}

export function renderLetterLayout(content: string, layout: LetterLayout, lineWidth: number = DEFAULT_LINE_WIDTH): LetterRenderResult {
    const bodyWidth = getLayoutBodyWidth(layout, lineWidth);
    // A raw layout keeps whitespace exactly as typed
    const baseLines = layout.raw
        ? content.split(/\r?\n/)
        : formatContent(content, bodyWidth);
    const bodySource = baseLines.length ? baseLines : [""];
    const lines = [
        ...layout.header.map(line => expandFillLine(line, bodyWidth)),
        ...formatBody(layout, bodySource, bodyWidth),
        ...layout.footer.map(line => expandFillLine(line, bodyWidth)),
    ];
    const hasContent = baseLines.some(line => line.length > 0);
    return { lines, hasContent };
}

export function renderLetter(content: string, template: LetterTemplate, lineWidth: number = DEFAULT_LINE_WIDTH): LetterRenderResult {
    return renderLetterLayout(content, BUILTIN_LETTER_LAYOUTS[template], lineWidth);
}
