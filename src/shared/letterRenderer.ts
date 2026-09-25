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

function justifyWords(words: string[], lettersLength: number, width: number, isLastLine: boolean): string {
    if (words.length === 0) {
        return "";
    }
    if (words.length === 1 || isLastLine) {
        return words.join(" ");
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

function wrapLine(normalizedLine: string, width: number): string[] {
    if (!normalizedLine) {
        return [];
    }
    const words = normalizedLine.split(" ");
    const lines: string[] = [];
    let currentWords: string[] = [];
    let lettersLength = 0;

    const flush = (isLastLine: boolean) => {
        if (!currentWords.length) {
            return;
        }
        lines.push(justifyWords(currentWords, lettersLength, width, isLastLine));
        currentWords = [];
        lettersLength = 0;
    };

    words.forEach(word => {
        if (word.length > width) {
            if (currentWords.length) {
                flush(false);
                currentWords = [];
                lettersLength = 0;
            }
            const parts = splitLongWord(word, width);
            const lastPart = parts.pop();
            if (parts.length) {
                lines.push(...parts);
            }
            if (lastPart) {
                currentWords = [lastPart];
                lettersLength = lastPart.length;
            }
            return;
        }

        const minimalSpaces = currentWords.length;
        if (lettersLength + word.length + minimalSpaces > width && currentWords.length) {
            flush(false);
            currentWords = [word];
            lettersLength = word.length;
            return;
        }

        currentWords.push(word);
        lettersLength += word.length;
    });

    flush(true);

    return lines;
}

function formatContent(content: string, width: number): string[] {
    const rawLines = content.split(/\r?\n/);
    const result: string[] = [];
    let pendingBlankLine = false;
    let hasContent = false;

    rawLines.forEach(line => {
        const normalized = normalizeLine(line);
        if (!normalized) {
            if (hasContent) {
                pendingBlankLine = true;
            }
            return;
        }

        if (pendingBlankLine && result.length) {
            result.push("");
            pendingBlankLine = false;
        }

        const wrapped = wrapLine(normalized, width);
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
 * and the suffix.
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

/** Body width left inside the frame for a total line width. */
export function getLayoutBodyWidth(layout: LetterLayout, totalWidth: number): number {
    if (layout.raw) {
        return Infinity;
    }
    return Math.max(1, totalWidth - layout.bodyPrefix.length - layout.bodySuffix.length);
}

function formatBodyLine(layout: LetterLayout, line: string, width: number): string {
    if (layout.raw) {
        return line;
    }
    const alignRight = line.startsWith(">");
    const content = alignRight ? line.slice(1) : line;
    const trimmed = content.length > width ? content.slice(0, width) : content;
    if (!layout.bodyPrefix && !layout.bodySuffix) {
        if (!line) {
            return "";
        }
        return alignRight ? trimmed.padStart(width, " ") : trimmed;
    }
    const padded = alignRight ? trimmed.padStart(width, " ") : trimmed.padEnd(width, " ");
    return `${layout.bodyPrefix}${padded}${layout.bodySuffix}`;
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
        ...bodySource.map(line => formatBodyLine(layout, line, bodyWidth)),
        ...layout.footer.map(line => expandFillLine(line, bodyWidth)),
    ];
    const hasContent = baseLines.some(line => line.length > 0);
    return { lines, hasContent };
}

export function renderLetter(content: string, template: LetterTemplate, lineWidth: number = DEFAULT_LINE_WIDTH): LetterRenderResult {
    return renderLetterLayout(content, BUILTIN_LETTER_LAYOUTS[template], lineWidth);
}
