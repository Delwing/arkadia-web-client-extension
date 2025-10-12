import Modal from "bootstrap/js/dist/modal";
import { stripAnsiCodes } from "@client/src/stripAnsiCodes";
import type { Trigger } from "@client/src/Triggers";
import { getMatchingPatterns, matchTrigger, patternToString } from "./triggerUtils";
import { uiStore } from "./ui/store";

type TriggerSource = "regular" | "multiline" | "token";

interface MatchResult {
    path: Trigger[];
    source: TriggerSource;
    patterns: string[];
}

function initTriggerFinder() {
    const button = document.getElementById("trigger-finder-button") as HTMLButtonElement | null;
    const modalEl = document.getElementById("trigger-finder-modal") as HTMLElement | null;
    if (!button || !modalEl) return;
    const modal = new Modal(modalEl);
    const runBtn = modalEl.querySelector("#trigger-finder-run") as HTMLButtonElement;
    const linesInput = modalEl.querySelector("#trigger-finder-lines") as HTMLTextAreaElement;
    const typeInput = modalEl.querySelector("#trigger-finder-type") as HTMLInputElement;
    const outputEl = modalEl.querySelector("#trigger-finder-output") as HTMLElement;

    button.addEventListener("click", () => {
        linesInput.value = "";
        typeInput.value = "";
        outputEl.textContent = "";
        modal.show();
    });

    runBtn.addEventListener("click", () => {
        const manager = uiStore.getState().clientBindings.triggers;
        if (!manager) {
            outputEl.textContent = "No trigger manager.";
            return;
        }
        const type = typeInput.value.trim();
        const rawLines = linesInput.value.split(/\r?\n/);
        const results: string[] = [];
        let anyLineProcessed = false;
        rawLines.forEach((rawLine, index) => {
            const displayLine = rawLine.trim();
            if (!displayLine) return;
            anyLineProcessed = true;
            const lineMatches = findMatches(rawLine, type, manager);
            const lineLabel = `Linia ${index + 1}: ${displayLine}`;
            results.push(lineLabel);
            if (lineMatches.length === 0) {
                results.push("  Brak pasujących triggerów.");
                return;
            }
            lineMatches.forEach(match => {
                const pathText = formatPath(match.path);
                const sourceLabel = sourceToLabel(match.source);
                const patternsText = match.patterns.length > 0 ? ` => ${match.patterns.join(" | ")}` : "";
                results.push(`  - ${pathText}${sourceLabel}${patternsText}`);
            });
        });
        if (!anyLineProcessed) {
            outputEl.textContent = "Brak linii do analizy.";
            return;
        }
        outputEl.textContent = results.join("\n");
    });
}

function findMatches(rawLine: string, type: string, manager: any): MatchResult[] {
    const matches: MatchResult[] = [];
    const linestrip = stripAnsiCodes(rawLine).replace(/\s$/g, "");
    const tokens = linestrip
        .split(/[ \n\t.,!?*()\/\[\]]+/)
        .filter((t: string) => t.length > 0)
        .map((t: string) => t.toLowerCase());

    const traverse = (trigger: Trigger, path: Trigger[], source: TriggerSource, forceMatch = false) => {
        const currentPath = [...path, trigger];
        const matched = forceMatch || matchTrigger(trigger, rawLine, type);
        if (!matched) return;
        const patternMatches = getMatchingPatterns(trigger, rawLine, type);
        const patterns = patternMatches.length > 0 ? patternMatches : extractPatternStrings(trigger);
        matches.push({ path: currentPath, source, patterns });
        trigger.children.forEach(child => traverse(child, currentPath, source));
    };

    manager.triggers && Array.from(manager.triggers.values()).forEach((trigger: Trigger) => {
        traverse(trigger, [], "regular");
    });

    manager.multilineTriggers && Array.from(manager.multilineTriggers.values()).forEach((trigger: Trigger) => {
        traverse(trigger, [], "multiline");
    });

    manager.tokenTriggers && manager.tokenTriggers.forEach((entry: any) => {
        const { words, trigger } = entry || {};
        if (!trigger || !Array.isArray(words)) return;
        if (!tokensMatch(tokens, words)) return;
        traverse(trigger, [], "token");
    });

    return matches;
}

function tokensMatch(tokens: string[], words: string[]): boolean {
    if (words.length === 0) return false;
    for (let i = 0; i <= tokens.length - words.length; i++) {
        let found = true;
        for (let j = 0; j < words.length; j++) {
            if (tokens[i + j] !== words[j]) {
                found = false;
                break;
            }
        }
        if (found) return true;
    }
    return false;
}

function extractPatternStrings(trigger: Trigger): string[] {
    const patterns = Array.isArray(trigger.pattern) ? trigger.pattern : [trigger.pattern];
    return patterns.map(patternToString);
}

function formatPath(path: Trigger[]): string {
    return path
        .map(trigger => {
            const text = patternToString(trigger.pattern);
            return trigger.tag ? `[${trigger.tag}] ${text}` : text;
        })
        .join(" > ");
}

function sourceToLabel(source: TriggerSource): string {
    switch (source) {
        case "multiline":
            return " (multiline)";
        case "token":
            return " (token)";
        default:
            return "";
    }
}

document.addEventListener("DOMContentLoaded", initTriggerFinder);
