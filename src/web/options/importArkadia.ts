import { Alias } from "./importBlowtorch";
import type { UserMacro, UserTrigger } from "@client/scripts/userTriggers.ts";

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ParseResult {
    imported: Alias[];
    skipped: string[];
}

export function parseArkadia(text: string): ParseResult {
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        return { imported: [], skipped: [] };
    }
    const aliasesObj = data.aliases;
    if (!aliasesObj || typeof aliasesObj !== "object") {
        return { imported: [], skipped: [] };
    }
    const imported: Alias[] = [];
    const skipped: string[] = [];
    for (const [key, value] of Object.entries<string>(aliasesObj as Record<string, string>)) {
        if (/%0|%-\d+|%%/.test(value)) {
            skipped.push(key);
            continue;
        }
        let command = value.replace(/\$(\d+)/g, "@$1");
        const matches = Array.from(value.match(/%(\d+)/g) || []).map(m => Number(m.slice(1)));
        if (matches.length) {
            command = command.replace(/%(\d+)/g, (_m, g1) => `$${g1}`);
        }
        const count = matches.length ? Math.max(...matches) : 0;
        let pattern = escapeRegex(key.trim());
        for (let i = 1; i <= count; i++) {
            pattern += `\\s+(\\w+)`;
        }
        pattern = `^${pattern}$`;
        imported.push({ pattern, command: command.trim() });
    }
    return { imported, skipped };
}


/** One "Przekształcanie tekstu" rule as the Arkadia client stores it in `patterns`. */
interface ArkadiaPattern {
    Regexp?: unknown;
    Replacement?: unknown;
    Color?: unknown;
    Sound?: unknown;
}

export interface PatternParseResult {
    imported: UserTrigger[];
    skipped: string[];
}

/** The client matches its rules against HTML-escaped text (kendo.htmlEncode). */
function decodeHtml(text: string): string {
    return text
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

/**
 * The Arkadia client's text transformations (`patterns`) as pattern triggers.
 *
 * The client runs its rules over each received message as a whole (a run of
 * same-type GMCP messages, often several lines), last rule first, each on the
 * text the ones before it left; its regexes carry the `m` flag. A rule
 * rewrites every match, then colours it, and may play one of its six sounds.
 * So each becomes a global multiline trigger ("gm": the whole message, ^ and $
 * at every line) with replace, color and beep actions in that order, and the
 * list is reversed to keep the order. The client's sounds have no counterpart,
 * so each becomes the default beep. Patterns are un-escaped, since the client
 * matches against HTML-escaped text and a rule matching `"` says `&quot;`.
 *
 * The client's variables in a replacement become the trigger's placeholders:
 * `$N` (capture group N+1) → `$N+1`, `%%` (whole match) → `$0`, `%N` (word N
 * of the match, from 0) → `{wordN+1}`, `%-N` (the match after N words) →
 * `{wordN+1+}`, and `$$` (the message from where the previous match ended) →
 * `{rest}`.
 *
 * Still not the same: a rule only fires if it matches the message as the game
 * sent it, not only after another rule changed it.
 */
export function parseArkadiaPatterns(text: string): PatternParseResult {
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        return { imported: [], skipped: [] };
    }
    const patterns: unknown = data?.patterns;
    if (!Array.isArray(patterns)) {
        return { imported: [], skipped: [] };
    }
    const imported: UserTrigger[] = [];
    const skipped: string[] = [];
    for (const entry of patterns as ArkadiaPattern[]) {
        if (!entry || typeof entry.Regexp !== "string" || !entry.Regexp) continue;
        const pattern = decodeHtml(entry.Regexp);
        try {
            new RegExp(pattern, "m");
        } catch {
            skipped.push(entry.Regexp);
            continue;
        }
        const macros: UserMacro[] = [];
        if (typeof entry.Replacement === "string") {
            const to = entry.Replacement.replace(/%%|%(-?)(\d+)|\$\$|\$(\d+)/g, (whole, rest?: string, word?: string, group?: string) => {
                if (group !== undefined) return `$${Number(group) + 1}`;
                if (word !== undefined) return `{word${Number(word) + 1}${rest ? "+" : ""}}`;
                return whole === "%%" ? "$0" : "{rest}";
            });
            macros.push({ type: "replace", to });
        }
        if (typeof entry.Color === "string" && /^#(?:[A-Fa-f0-9]{3}){1,2}$/.test(entry.Color)) {
            macros.push({ type: "color", color: entry.Color });
        }
        if (entry.Sound !== undefined) {
            macros.push({ type: "beep", soundKey: "beep" });
        }
        if (!macros.length) continue;
        imported.push({ type: "pattern", pattern, flags: "gm", macros });
    }
    return { imported: imported.reverse(), skipped };
}
