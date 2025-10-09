import type { Trigger } from "@client/src/Triggers";
import { stripAnsiCodes } from "@client/src/stripAnsiCodes";

export function matchTrigger(trigger: Trigger, rawLine: string, type: string): boolean {
    const line = stripAnsiCodes(rawLine).replace(/\s$/g, "");
    const patterns = Array.isArray(trigger.pattern) ? trigger.pattern : [trigger.pattern];
    for (const pattern of patterns) {
        if (pattern instanceof RegExp) {
            if (line.match(pattern)) return true;
        } else if (typeof pattern === "string") {
            const index = rawLine.toLowerCase().indexOf(pattern.toLowerCase());
            if (index > -1) return true;
        } else if (typeof pattern === "function") {
            const res = pattern(rawLine, line, undefined as any, type);
            if (res) return true;
        }
    }
    return false;
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
