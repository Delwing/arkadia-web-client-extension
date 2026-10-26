/**
 * The character a Mudlet name (scripts.character_name) belongs to here: a
 * known one with the same name in any case, else the name in lower case, the
 * way the game announces it.
 */
export function localCharacter(mudlet: string, known: string[]): string {
    const lower = mudlet.toLowerCase();
    return known.find(c => c.toLowerCase() === lower) ?? lower;
}
