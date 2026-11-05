/**
 * Merge two per-character category envelopes ({ characterName: data } maps).
 * The preferred side wins for characters present in both; characters exclusive
 * to either side are all kept. Used in conflict resolution so choosing
 * "keep local" or "use cloud" never discards a character that only the other
 * side knows about (e.g. desktop plays char X while laptop plays char Y).
 * Returns a canonical (key-sorted) JSON string.
 */
export function mergePerCharacterEnvelopes(preferredJson: string, otherJson: string): string {
    let preferred: Record<string, unknown>;
    let other: Record<string, unknown>;
    try {
        preferred = JSON.parse(preferredJson);
        other = JSON.parse(otherJson);
    } catch {
        return preferredJson;
    }
    if (!preferred || typeof preferred !== 'object' || Array.isArray(preferred)
        || !other || typeof other !== 'object' || Array.isArray(other)) {
        return preferredJson;
    }
    const merged: Record<string, unknown> = {};
    for (const char of Object.keys({ ...other, ...preferred }).sort()) {
        merged[char] = char in preferred ? preferred[char] : other[char];
    }
    return JSON.stringify(merged);
}
