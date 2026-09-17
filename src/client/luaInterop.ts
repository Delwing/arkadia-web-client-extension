export function escapeLuaString(str: string): string {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
}

export function createMatchesLuaCode(matches: RegExpMatchArray): string {
    const entries: string[] = [];

    // Add indexed groups (1-based for Lua)
    matches.forEach((value, index) => {
        if (value !== undefined) {
            entries.push(`[${index + 1}] = "${escapeLuaString(value)}"`);
        }
    });

    // Add named groups
    if (matches.groups) {
        Object.entries(matches.groups).forEach(([key, value]) => {
            if (value !== undefined) {
                entries.push(`["${key}"] = "${escapeLuaString(value)}"`);
            }
        });
    }

    return `matches = {${entries.join(", ")}}`;
}
