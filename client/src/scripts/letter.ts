import Client from "../Client";
import { defaultSettings } from "../defaultSettings";

const PROMPT_PATTERN = /Wpisz ~\?, zeby uzyskac pomoc, lub \*\*, by zakonczyc edycje\./;
const TRIGGER_TAG = "letter-composer";
const MIN_LINE_WIDTH = 20;
const MAX_LINE_WIDTH = 120;

interface LetterSubmitPayload {
    to: string;
    cc: string;
    subject: string;
    content: string;
}

let lineWidth = clampLineWidth(defaultSettings.letterLineWidth);

function clampLineWidth(width: number) {
    const rounded = Math.round(width);
    return Math.min(MAX_LINE_WIDTH, Math.max(MIN_LINE_WIDTH, rounded));
}

function updateLineWidth(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        lineWidth = clampLineWidth(value);
        return;
    }
    if (typeof value === "string") {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) {
            lineWidth = clampLineWidth(parsed);
        }
    }
}

function normalizeLine(line: string) {
    return line.replace(/\s+/g, " ").trim();
}

function splitLongWord(word: string, width: number) {
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += width) {
        parts.push(word.slice(i, i + width));
    }
    return parts;
}

function justifyWords(words: string[], lettersLength: number, width: number, isLastLine: boolean) {
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

function wrapLine(normalizedLine: string, width: number) {
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

function formatContent(content: string, width: number) {
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

function printPreview(client: Client, lines: string[]) {
    const header = `Podglad listu (szerokosc ${lineWidth})`;
    if (!lines.length) {
        client.println(`${header}\n(brak tresci)`);
        return;
    }
    client.println([header, ...lines].join("\n"));
}

export default function initLetter(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (aliases) {
        aliases.push({
            pattern: /^\/list$/,
            callback: () => {
                client.sendEvent("letterComposer", { open: true });
            }
        });
    }

    client.addEventListener("settings", (event: CustomEvent<Partial<{ letterLineWidth?: number }>>) => {
        updateLineWidth(event.detail?.letterLineWidth);
    });

    client.addEventListener("letterComposer.submit", (event: CustomEvent<LetterSubmitPayload>) => {
        const { to, cc, subject, content } = event.detail;
        const recipient = to.trim();
        const carbonCopy = cc.trim();
        const subjectLine = subject.trim();
        const lines = formatContent(content, lineWidth);

        client.Triggers.removeByTag(TRIGGER_TAG);
        client.Triggers.registerOneTimeTrigger(
            PROMPT_PATTERN,
            () => {
                lines.forEach(line => {
                    if (line.length > 0) {
                        client.sendCommand(line);
                    }
                });
                client.sendCommand("**");
                return undefined;
            },
            TRIGGER_TAG
        );

        client.sendCommand("napisz list");
        client.sendCommand(recipient);
        client.sendCommand(subjectLine);
        client.sendCommand(carbonCopy);
    });

    client.addEventListener("letterComposer.preview", (event: CustomEvent<LetterSubmitPayload>) => {
        const lines = formatContent(event.detail.content, lineWidth);
        printPreview(client, lines);
    });
}
