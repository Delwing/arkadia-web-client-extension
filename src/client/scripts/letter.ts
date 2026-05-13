import Client from "../Client";
import {defaultSettings} from "@modules/core/defaultSettings";
import type {LetterTemplate} from "../types/letter";
import {LETTER_TEMPLATE_PREVIEW_LABELS, isLetterTemplate} from "../types/letter";
import {characterStorage} from "@modules/core/storage";

const PROMPT_PATTERN = /Wpisz ~\?, zeby uzyskac pomoc, lub \*\*, by zakonczyc edycje\./;
const TRIGGER_TAG = "letter-composer";
const MIN_LINE_WIDTH = 20;
const MAX_LINE_WIDTH = 120;
const DEFAULT_TEMPLATE: LetterTemplate = "plain";

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

function normalizeTemplate(value: unknown): LetterTemplate {
    if (isLetterTemplate(value)) {
        return value;
    }
    return DEFAULT_TEMPLATE;
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

interface LetterTemplateRenderer {
    createHeader(width: number): string[];

    createFooter(width: number): string[];

    formatLine(line: string, width: number): string;

    getBodyWidth(totalWidth: number): number;
}

class NoneTemplate implements LetterTemplateRenderer {
    createHeader(): string[] {
        return [];
    }

    createFooter(): string[] {
        return [];
    }

    getBodyWidth(totalWidth: number): number {
        return totalWidth;
    }

    formatLine(line: string, width: number): string {
        if (!line) {
            return "";
        }
        if (line.startsWith(">")) {
            const content = line.slice(1);
            const trimmed = content.length > width ? content.slice(0, width) : content;
            return trimmed.padStart(width, " ");
        }
        return line.length > width ? line.slice(0, width) : line;
    }
}

abstract class BaseLetterTemplate implements LetterTemplateRenderer {
    private readonly prefixLength: number;
    private readonly suffixLength: number;

    protected constructor(private readonly bodyPrefix: string, private readonly bodySuffix: string) {
        this.prefixLength = bodyPrefix.length;
        this.suffixLength = bodySuffix.length;
    }

    abstract createHeader(width: number): string[];

    abstract createFooter(width: number): string[];

    getBodyWidth(totalWidth: number): number {
        const decorationWidth = this.prefixLength + this.suffixLength;
        const bodyWidth = totalWidth - decorationWidth;
        return Math.max(1, bodyWidth);
    }

    formatLine(line: string, width: number): string {
        const alignRight = line.startsWith(">");
        const content = alignRight ? line.slice(1) : line;
        const trimmed = content.length > width ? content.slice(0, width) : content;
        const padded = alignRight ? trimmed.padStart(width, " ") : trimmed.padEnd(width, " ");
        return `${this.bodyPrefix}${padded}${this.bodySuffix}`;
    }
}

class PlainTemplate extends BaseLetterTemplate {
    constructor() {
        super(" |  ", "  | ");
    }

    createHeader(width: number) {
        const dashes = "-".repeat(width);
        const spaces = " ".repeat(width);
        return [
            ` +--${dashes}--+ `,
            ` |  ${spaces}  | `,
            ` |  ${spaces}  | `,
        ];
    }

    createFooter(width: number) {
        const dashes = "-".repeat(width);
        const spaces = " ".repeat(width);
        return [
            ` |  ${spaces}  | `,
            ` |  ${spaces}  | `,
            ` +--${dashes}--+ `,
        ];
    }
}

class ParchmentTemplate extends BaseLetterTemplate {
    constructor() {
        super("   |   ", "  |.");
    }

    createHeader(width: number) {
        const underscores = "_".repeat(width);
        const spaces = " ".repeat(width);
        return [
            `  ____${underscores}___  `,
            `/ \\   ${spaces}   \\.`,
            `|  |  ${spaces}   |.`,
            `\\_ |  ${spaces}   |.`,
            `   |  ${spaces}   |.`,
        ];
    }

    createFooter(width: number) {
        const underscores = "_".repeat(width);
        const spaces = " ".repeat(width);
        return [
            `   |  ${spaces}   |.   `,
            `   |   ${underscores}__|___ `,
            `   |  /${spaces}     /.`,
            `   \\_/_${underscores}____/. `,
        ];
    }
}

class Parchment2Template extends BaseLetterTemplate {
    constructor() {
        super(" |     ", "   |   ");
    }

    createHeader(width: number) {
        const underscores = "_".repeat(width);
        const spaces = " ".repeat(width);
        return [
            ` ______${underscores}_____  `,
            String.raw` / _\  ${spaces}     \ `,
            `|/ >|  ${spaces}     | `,
            String.raw` |\_/__${underscores}______/`,
            String.raw` \.    ${spaces}   ./  `,
            ` |     ${spaces}   |   `,
        ];
    }

    createFooter(width: number) {
        const underscores = "_".repeat(width);
        const spaces = " ".repeat(width);
        return [
            ` |  ___${underscores}___|   `,
            String.raw` |/\   ${spaces}     \ `,
            String.raw` \_|   ${spaces}      |`,
            String.raw`  \_/_ ${underscores}_____/ `,
        ];
    }
}

class Parchment3Template extends BaseLetterTemplate {
    constructor() {
        super(" |       |   ", "        | ");
    }

    createHeader(width: number) {
        const spaces = " ".repeat(width);
        const dashes = "-".repeat(width);
        return [
            `             ${spaces}  .---.   `,
            `             ${spaces} /  .  \\ `,
            `             ${spaces}|\\_/|   |`,
            `             ${spaces}|   |  /| `,
            String.raw`   .---------${dashes}------\' |`,
            `  /  .-.     ${spaces}        | `,
            ` |  /   \\   ${spaces}         |`,
            ` | |\\_.  |  ${spaces}         |`,
            ` |\\|  | /|  ${spaces}         |`,
            String.raw` | \`---\' |  ${spaces}        | `,
        ];
    }

    createFooter(width: number) {
        const spaces = " ".repeat(width);
        const dashes = "-".repeat(width);
        return [
            ` |       |   ${spaces}        /   `,
            String.raw` |       |---${dashes}--------\' `,
            ` \\       |  ${spaces}            `,
            ` \\.___./    ${spaces}            `,
        ];
    }
}

class RawTemplate implements LetterTemplateRenderer {
    createHeader(): string[] {
        return [];
    }

    createFooter(): string[] {
        return [];
    }

    getBodyWidth(): number {
        return Infinity;
    }

    formatLine(line: string): string {
        return line;
    }
}

const TEMPLATE_RENDERERS: Record<LetterTemplate, LetterTemplateRenderer> = {
    none: new NoneTemplate(),
    plain: new PlainTemplate(),
    parchment: new ParchmentTemplate(),
    parchment2: new Parchment2Template(),
    parchment3: new Parchment3Template(),
    raw: new RawTemplate(),
};

function applyTemplate(lines: string[], width: number, renderer: LetterTemplateRenderer) {
    const header = renderer.createHeader(width);
    const footer = renderer.createFooter(width);
    const bodySource = lines.length ? lines : [""];
    const body = bodySource.map(line => renderer.formatLine(line, width));
    return [...header, ...body, ...footer];
}

function renderLetter(content: string, template: LetterTemplate) {
    const renderer = TEMPLATE_RENDERERS[template];
    const bodyWidth = renderer.getBodyWidth(lineWidth);
    // For "raw" template, preserve whitespace exactly as-is
    const baseLines = template === "raw"
        ? content.split(/\r?\n/)
        : formatContent(content, bodyWidth);
    const lines = applyTemplate(baseLines, bodyWidth, renderer);
    const hasContent = baseLines.some(line => line.length > 0);
    return {lines, hasContent};
}

function printPreview(client: Client, lines: string[], template: LetterTemplate, hasContent: boolean) {
    const templateLabel = LETTER_TEMPLATE_PREVIEW_LABELS[template] ?? template;
    const header = `Podglad listu (szerokosc ${lineWidth}, szablon ${templateLabel})`;
    if (!hasContent) {
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
                client.sendEvent("letterComposer", {});
            }
        });
    }

    const initialSettings = characterStorage.get('settings');
    if (initialSettings) {
        const detail = (initialSettings ?? defaultSettings) as { letterLineWidth?: number };
        updateLineWidth(detail?.letterLineWidth);
    }
    characterStorage.onChange('settings', (settings) => {
        const detail = (settings ?? defaultSettings) as { letterLineWidth?: number };
        updateLineWidth(detail?.letterLineWidth);
    });

    client.on("letterComposer.submit", (payload) => {
        const {to, cc, udw, subject, content, template: rawTemplate} = payload ?? {};
        const recipient = to.trim();
        const carbonCopy = cc.trim();
        const blindCopy = udw.trim();
        const subjectLine = subject.trim();
        const template = normalizeTemplate(rawTemplate);
        const {lines} = renderLetter(content, template);

        client.Triggers.removeByTag(TRIGGER_TAG);
        client.Triggers.registerOneTimeTrigger(
            PROMPT_PATTERN,
            (line) => {
                if (blindCopy) {
                    const recipients = blindCopy.split(/\s+/).filter(name => name.length > 0);
                    recipients.forEach(name => {
                        client.sendCommand(`~udw ${name}`, true, {preserveCase: true});
                    });
                }
                lines.forEach(line => {
                    client.sendCommand(line, true, {preserveCase: true});
                });
                client.sendCommand("**");
                return line;
            },
            TRIGGER_TAG
        );

        client.sendCommand("napisz list");
        client.sendCommand(recipient, true, {preserveCase: true});
        client.sendCommand(subjectLine, true, {preserveCase: true});
        client.sendCommand(carbonCopy, true, {preserveCase: true});
    });

    client.on("letterComposer.preview", (payload) => {
        const template = normalizeTemplate(payload?.template);
        const {lines, hasContent} = renderLetter(payload?.content ?? "", template);
        printPreview(client, lines, template, hasContent);
    });
}
