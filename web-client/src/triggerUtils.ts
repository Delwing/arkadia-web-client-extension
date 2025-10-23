import type { Trigger } from "@client/src/Triggers";
import { stripAnsiCodes } from "@client/src/stripAnsiCodes";

function sanitizeLine(rawLine: string): { sanitized: string; stripped: string } {
    const colorless = stripAnsiCodes(rawLine);
    const promptMatch = colorless.match(/^>\s?/);
    const promptLength = promptMatch ? promptMatch[0].length : 0;
    const sanitized = colorless.slice(promptLength);
    const stripped = sanitized.replace(/\s$/g, "");
    return { sanitized, stripped };
}

export function matchTrigger(trigger: Trigger, rawLine: string, type: string): boolean {
    const { sanitized, stripped } = sanitizeLine(rawLine);
    const patterns = Array.isArray(trigger.pattern) ? trigger.pattern : [trigger.pattern];
    for (const pattern of patterns) {
        if (pattern instanceof RegExp) {
            if (stripped.match(pattern)) return true;
        } else if (typeof pattern === "string") {
            const index = sanitized.toLowerCase().indexOf(pattern.toLowerCase());
            if (index > -1) return true;
        } else if (typeof pattern === "function") {
            const res = pattern(rawLine, stripped, undefined as any, type);
            if (res) return true;
        }
    }
    return false;
}

export function getMatchingPatterns(trigger: Trigger, rawLine: string, type: string): string[] {
    const { sanitized, stripped } = sanitizeLine(rawLine);
    const matches: string[] = [];
    const patterns = Array.isArray(trigger.pattern) ? trigger.pattern : [trigger.pattern];

    const analyze = (pattern: any) => {
        if (Array.isArray(pattern)) {
            pattern.forEach(analyze);
            return;
        }
        if (pattern instanceof RegExp) {
            if (stripped.match(pattern)) {
                matches.push(pattern.toString());
            }
            return;
        }
        if (typeof pattern === "string") {
            const index = sanitized.toLowerCase().indexOf(pattern.toLowerCase());
            if (index > -1) {
                matches.push(pattern);
            }
            return;
        }
        if (typeof pattern === "function") {
            const res = pattern(rawLine, stripped, undefined as any, type);
            if (res) {
                matches.push(pattern.name ? `[fn ${pattern.name}]` : "[fn]");
            }
        }
    };

    patterns.forEach(analyze);
    return matches;
}

export function patternToString(pattern: any): string {
    if (Array.isArray(pattern)) {
        return pattern.map(patternToString).join(" | ");
    }
    if (pattern instanceof RegExp) return pattern.toString();
    if (typeof pattern === "string") return pattern;
    if (typeof pattern === "function") return pattern.name ? `[fn ${pattern.name}]` : "[fn]";
    return String(pattern);
}
