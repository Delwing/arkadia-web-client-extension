import { Alias } from "./importBlowtorch";

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

