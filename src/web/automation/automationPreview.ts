/**
 * What an alias or trigger would do with a test input, worked out without
 * running anything: which part matches, the groups, the line after the actions
 * that change it, and what the other actions would send or show.
 *
 * The line is approximated at the text level (colour, replace, wrap, upper
 * case). The runtime works on an ANSI buffer, but for "does my trigger do what
 * I think" the text and the colour are what matter.
 */
import { expandAliasCommand, substituteGroups } from "@client/scripts/userAliases";
import { interpolateMatch, type UserMacro } from "@client/scripts/userTriggers";
import { actionShort } from "./automationModel";

export interface PatternTest {
    error?: string;
    /** Every match (one unless the trigger is global). */
    matches: RegExpMatchArray[];
}

/** Trigger pattern against a line; `flags` as stored (i, g, m). */
export function testTriggerPattern(pattern: string, flags: string, text: string): PatternTest {
    if (!pattern) return { matches: [] };
    let regexp: RegExp;
    try {
        regexp = new RegExp(pattern, `g${flags.includes("i") ? "i" : ""}`);
    } catch (err) {
        return { error: (err as Error).message, matches: [] };
    }
    if (!text) return { matches: [] };
    const matches: RegExpMatchArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = regexp.exec(text)) !== null) {
        matches.push(m);
        if (!flags.includes("g")) break;
        if (m[0].length === 0) regexp.lastIndex++;
    }
    return { matches };
}

/** Alias pattern against a typed command; aliases match the whole command. */
export function testAliasPattern(pattern: string, input: string): PatternTest {
    if (!pattern) return { matches: [] };
    let regexp: RegExp;
    try {
        regexp = new RegExp(`^${pattern}$`);
    } catch (err) {
        return { error: (err as Error).message, matches: [] };
    }
    const m = input ? input.match(regexp) : null;
    return { matches: m ? [m] : [] };
}

/** Number of capture groups in a pattern; 0 when it does not compile. */
export function groupCount(pattern: string): number {
    try {
        return (new RegExp(`${pattern}|`).exec("")?.length ?? 1) - 1;
    } catch {
        return 0;
    }
}

/** The groups of a match as `$1 = ...` pairs, skipping ones that did not take part. */
export function matchGroups(m: RegExpMatchArray): { token: string; value: string }[] {
    const out: { token: string; value: string }[] = [];
    for (let i = 1; i < m.length; i++) {
        if (m[i] !== undefined) out.push({ token: `$${i}`, value: m[i] });
    }
    return out;
}

export interface LineSegment {
    text: string;
    /** Part of a match. */
    match?: boolean;
    color?: string;
    /** Blinks or pulses in the game window. */
    effect?: boolean;
}

export type OutputKind = "command" | "notify" | "push" | "speak" | "echo" | "sound" | "bind" | "script" | "group" | "other";

export interface PreviewOutput {
    kind: OutputKind;
    text: string;
}

function linelessOutput(m: UserMacro, fill: (t: string) => string, fallback: string, args: string[] = []): PreviewOutput | null {
    // Without a message these fall back to the matched text; an alias has none, and skips them.
    const message = (kind: OutputKind): PreviewOutput | null => {
        const text = fill(m.message ?? "") || fallback;
        return text ? { kind, text } : null;
    };
    switch (m.type) {
        case "command": return m.command ? { kind: "command", text: fill(m.command) } : null;
        case "notify": return message("notify");
        case "push": return message("push");
        case "speak": return message("speak");
        case "echo": return m.message ? { kind: "echo", text: fill(m.message) } : null;
        case "beep": return { kind: "sound", text: m.soundKey && m.soundKey !== "beep" ? m.soundKey : "domyslny beep" };
        case "mute": return { kind: "sound", text: "wyciszenie dzwiekow" };
        case "unmute": return { kind: "sound", text: "wlaczenie dzwiekow" };
        case "functionalBind":
            return m.label && m.command ? { kind: "bind", text: `[${fill(m.label)}] ${fill(m.command)}` } : null;
        case "script":
            return m.scriptId ? { kind: "script", text: `${actionShort(m)}${args.length ? ` (${args.join(", ")})` : ""}` } : null;
        case "group":
            return m.groupId ? { kind: "group", text: actionShort(m) } : null;
        default: return null;
    }
}

/** A pattern trigger's effect on a test line. */
export function previewTrigger(text: string, matches: RegExpMatchArray[], macros: UserMacro[]): {
    segments: LineSegment[];
    outputs: PreviewOutput[];
} {
    if (!matches.length) return { segments: [{ text }], outputs: [] };

    let linePrefix = "";
    let lineSuffix = "";
    const pieces: LineSegment[] = [];
    let pos = 0;
    for (const m of matches) {
        const start = m.index ?? 0;
        if (start > pos) pieces.push({ text: text.slice(pos, start) });
        let seg: LineSegment = { text: m[0], match: true };
        for (const macro of macros) {
            switch (macro.type) {
                case "uppercase": seg = { ...seg, text: seg.text.toUpperCase() }; break;
                case "replace": seg = { ...seg, text: macro.to ?? "" }; break;
                case "color": seg = { ...seg, color: macro.color }; break;
                case "slowBlink":
                case "rapidBlink":
                case "dim": seg = { ...seg, effect: true }; break;
                case "wrap":
                    if (macro.wrapScope === "line") {
                        linePrefix = (macro.wrapPrefix ?? "") + linePrefix;
                        lineSuffix += macro.wrapSuffix ?? "";
                    } else {
                        seg = { ...seg, text: `${macro.wrapPrefix ?? ""}${seg.text}${macro.wrapSuffix ?? ""}` };
                    }
                    break;
            }
        }
        pieces.push(seg);
        pos = start + m[0].length;
    }
    if (pos < text.length) pieces.push({ text: text.slice(pos) });
    const segments = [
        ...(linePrefix ? [{ text: linePrefix }] : []),
        ...pieces,
        ...(lineSuffix ? [{ text: lineSuffix }] : []),
    ];

    // Lineless actions run once per match, as in the runtime.
    const outputs = matches.flatMap(m => macros
        .map(macro => linelessOutput(macro, t => interpolateMatch(t, m), m[0], Array.from(m).slice(1).map(g => g ?? "")))
        .filter((o): o is PreviewOutput => o !== null));
    return { segments, outputs };
}

/**
 * What an alias sends and does for a typed command. `override`, when given,
 * stands in for the command actions, as it does for that character.
 */
export function previewAlias(match: RegExpMatchArray, actions: UserMacro[], override?: string): PreviewOutput[] {
    const outputs: PreviewOutput[] = [];
    const commands = (command: string) => expandAliasCommand(command, match)
        .flatMap(c => c.split(";"))
        .map(c => c.trim())
        .filter(Boolean)
        .map(text => ({ kind: "command" as const, text }));
    let overrideShown = false;
    if (override && !actions.some(a => a.type === "command")) {
        outputs.push(...commands(override));
        overrideShown = true;
    }
    for (const action of actions) {
        if (action.type === "command") {
            if (override) {
                if (!overrideShown) outputs.push(...commands(override));
                overrideShown = true;
            } else if (action.command) {
                outputs.push(...commands(action.command));
            }
            continue;
        }
        const out = linelessOutput(action, t => substituteGroups(t, match), "", Array.from(match).slice(1).map(g => g ?? ""));
        if (out) outputs.push(out);
    }
    return outputs;
}
