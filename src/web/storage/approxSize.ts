/**
 * Roughly how much room a stored value takes: string characters, the bytes of
 * binary data, a few bytes per number, summed through arrays and objects.
 *
 * Not the bytes on disk (a browser compresses what it stores and adds its own
 * bookkeeping) and not meant to be: it is for comparing one thing with another
 * (this log with that one, the logs with the map data), so it only has to be
 * consistent. Shown with a "~" for that reason.
 */
const MAX_DEPTH = 64;

export function approxSize(value: unknown, depth = 0): number {
    if (value === null || value === undefined || depth > MAX_DEPTH) return 0;
    switch (typeof value) {
        case "string":
            return value.length;
        case "number":
        case "bigint":
            return 8;
        case "boolean":
            return 1;
        case "object":
            break;
        default:
            return 0;
    }
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    if (typeof Blob !== "undefined" && value instanceof Blob) return value.size;
    if (value instanceof Date) return 8;
    let total = 0;
    if (Array.isArray(value)) {
        for (const item of value) total += approxSize(item, depth + 1);
        return total;
    }
    if (value instanceof Map) {
        for (const [key, item] of value) total += approxSize(key, depth + 1) + approxSize(item, depth + 1);
        return total;
    }
    if (value instanceof Set) {
        for (const item of value) total += approxSize(item, depth + 1);
        return total;
    }
    for (const key in value as Record<string, unknown>) {
        total += key.length + approxSize((value as Record<string, unknown>)[key], depth + 1);
    }
    return total;
}
