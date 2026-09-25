import Client from "../Client";
import {defaultSettings} from "@modules/core/defaultSettings";
import type {LetterTemplate} from "../types/letter";
import {characterStorage} from "@modules/core/storage";
import {resolveLetterTemplate, type ResolvedLetterTemplate} from "@modules/core/letterTemplates";
import {DEFAULT_LETTER_ALIGNMENT, clampLineWidth, isLetterAlignment, renderLetterLayout} from "@shared/letterRenderer";

const PROMPT_PATTERN = /Wpisz ~\?, zeby uzyskac pomoc, lub \*\*, by zakonczyc edycje\./;
const TRIGGER_TAG = "letter-composer";
const DEFAULT_TEMPLATE: LetterTemplate = "plain";

let lineWidth = clampLineWidth(defaultSettings.letterLineWidth);

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

/** The width a letter asks for, or the configured default. */
function widthFor(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? clampLineWidth(value) : lineWidth;
}

function alignmentFor(value: unknown) {
    return isLetterAlignment(value) ? value : DEFAULT_LETTER_ALIGNMENT;
}

function resolveTemplate(value: unknown): ResolvedLetterTemplate {
    return resolveLetterTemplate(value) ?? resolveLetterTemplate(DEFAULT_TEMPLATE)!;
}

function printPreview(client: Client, lines: string[], template: ResolvedLetterTemplate, width: number, hasContent: boolean) {
    const header = `Podglad listu (szerokosc ${width}, szablon ${template.label})`;
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
        const template = resolveTemplate(rawTemplate);
        const {lines} = renderLetterLayout(content, template.layout, widthFor(payload?.lineWidth), alignmentFor(payload?.alignment));

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
        const template = resolveTemplate(payload?.template);
        const width = widthFor(payload?.lineWidth);
        const {lines, hasContent} = renderLetterLayout(payload?.content ?? "", template.layout, width, alignmentFor(payload?.alignment));
        printPreview(client, lines, template, width, hasContent);
    });
}
