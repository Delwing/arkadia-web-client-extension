import type Triggers from "../Triggers";
import type {TriggerCallback} from "../Triggers";

// Trigger definitions generated from upstream Arkadia.xml by
// scripts/extract-upstream-triggers.mjs (and extract-follow-patterns.mjs).

export interface UpstreamPattern {
    pattern: string;
    type: number;
}

export interface UpstreamTrigger {
    name: string;
    script: string;
    patterns: UpstreamPattern[];
    parents?: {
        name: string;
        patterns: UpstreamPattern[];
    }[];
}

// Pattern types from Mudlet:
// 0 = substring (matches anywhere)
// 1 = regex
// 2 = startOfLine (substring at start)
// 3 = exactMatch (entire line must match)
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function patternToTrigger(entry: UpstreamPattern): string | RegExp {
    const {pattern, type} = entry;
    switch (type) {
        case 1: // regex
            // PCRE's leading (?i) has no JS spelling; it is the `i` flag.
            return pattern.startsWith("(?i)")
                ? new RegExp(pattern.slice(4), "i")
                : new RegExp(pattern);
        case 2: // startOfLine
            return new RegExp(`^${escapeRegExp(pattern)}`);
        case 3: // exactMatch
            return new RegExp(`^${escapeRegExp(pattern)}$`);
        case 0: // substring
        default:
            return pattern;
    }
}

/** The name of the function a trigger's script calls, e.g. `trigger_func_strzaly`. */
function scriptFunction(script: string): string {
    return script.split("(")[0].trim();
}

/** The generated triggers whose script calls `func`; throws if the extractor dropped it. */
export function upstreamTriggers(triggers: UpstreamTrigger[], func: string): UpstreamTrigger[] {
    const found = triggers.filter(t => scriptFunction(t.script) === func);
    if (found.length === 0) {
        throw new Error(`No upstream trigger calls ${func} — re-run scripts/extract-upstream-triggers.mjs`);
    }
    return found;
}

/** Every pattern of the generated triggers calling `func`, ready for registerTrigger. */
export function upstreamPatterns(triggers: UpstreamTrigger[], func: string): (string | RegExp)[] {
    return upstreamTriggers(triggers, func).flatMap(t => t.patterns.map(patternToTrigger));
}

/**
 * Registers one generated trigger the way Mudlet nests it: a trigger with a
 * parent fires only as the parent's child.
 */
export function registerUpstreamTrigger(
    triggers: Triggers,
    entry: UpstreamTrigger,
    callback: TriggerCallback,
    tag?: string,
) {
    const patterns = entry.patterns.map(patternToTrigger);
    const parent = entry.parents?.[0];
    if (parent) {
        const parentTrigger = triggers.registerTrigger(parent.patterns.map(patternToTrigger), undefined, tag);
        return parentTrigger.registerChild(patterns, callback, tag);
    }
    return triggers.registerTrigger(patterns, callback, tag);
}
