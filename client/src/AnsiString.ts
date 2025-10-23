import { stripAnsiCodes } from "./stripAnsiCodes";

const ANSI_PATTERN = /\x1B\[[0-9;?]*[ -/]*[@-~]|{clickOpen:\d+(?::[^}]+)?}|{clickClose}/g;

type AnsiSegment =
    | { type: "ansi"; value: string }
    | { type: "text"; value: string };

function splitAnsiString(input: string): AnsiSegment[] {
    if (!input) {
        return [];
    }
    const segments: AnsiSegment[] = [];
    let lastIndex = 0;
    for (let match; (match = ANSI_PATTERN.exec(input));) {
        if (match.index > lastIndex) {
            const textSlice = input.slice(lastIndex, match.index);
            if (textSlice.length > 0) {
                segments.push({ type: "text", value: textSlice });
            }
        }
        segments.push({ type: "ansi", value: match[0] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < input.length) {
        segments.push({ type: "text", value: input.slice(lastIndex) });
    }
    return segments;
}

function mergeAdjacentTextSegments(segments: AnsiSegment[]) {
    for (let i = 0; i < segments.length - 1;) {
        const current = segments[i];
        const next = segments[i + 1];
        if (current.type === "text" && next.type === "text") {
            current.value += next.value;
            segments.splice(i + 1, 1);
        } else {
            i += 1;
        }
    }
}

interface PlainLocation {
    segmentIndex: number;
    offset: number;
}

export default class AnsiString {
    private segments: AnsiSegment[] = [];
    private plain = "";

    constructor(raw: string) {
        this.setRaw(raw);
    }

    setRaw(raw: string) {
        this.segments = splitAnsiString(raw);
        this.recomputePlain();
    }

    toString() {
        return this.segments.map(segment => segment.value).join("");
    }

    getRaw() {
        return this.toString();
    }

    getPlain() {
        return this.plain;
    }

    getPlainIndexFromRaw(rawIndex: number) {
        if (rawIndex <= 0) {
            return 0;
        }
        let consumedRaw = 0;
        let consumedPlain = 0;
        for (const segment of this.segments) {
            if (segment.type === "ansi") {
                const nextRaw = consumedRaw + segment.value.length;
                if (rawIndex <= nextRaw) {
                    return consumedPlain;
                }
                consumedRaw = nextRaw;
                continue;
            }
            const nextRaw = consumedRaw + segment.value.length;
            if (rawIndex <= nextRaw) {
                return consumedPlain + (rawIndex - consumedRaw);
            }
            consumedRaw = nextRaw;
            consumedPlain += segment.value.length;
        }
        return consumedPlain;
    }

    indexOf(target: string, start = 0, caseInsensitive = false) {
        const haystack = caseInsensitive ? this.plain.toLowerCase() : this.plain;
        const needle = caseInsensitive ? target.toLowerCase() : target;
        return haystack.indexOf(needle, start);
    }

    replacePlainRange(start: number, end: number, replacement: string) {
        const safeStart = Math.max(0, Math.min(start, this.plain.length));
        const safeEnd = Math.max(safeStart, Math.min(end, this.plain.length));
        const startIndex = this.splitAtPlainIndex(safeStart);
        const endIndex = this.splitAtPlainIndex(safeEnd);
        const replacementSegments = splitAnsiString(replacement);
        this.segments.splice(startIndex, endIndex - startIndex, ...replacementSegments);
        mergeAdjacentTextSegments(this.segments);
        this.recomputePlain();
        return this;
    }

    insertPlain(index: number, value: string) {
        return this.replacePlainRange(index, index, value);
    }

    wrapPlainRange(start: number, end: number, prefix: string, suffix: string) {
        this.replacePlainRange(end, end, suffix);
        this.replacePlainRange(start, start, prefix);
        return this;
    }

    stripAnsi() {
        return stripAnsiCodes(this.getRaw());
    }

    private recomputePlain() {
        this.plain = this.segments
            .filter((segment): segment is { type: "text"; value: string } => segment.type === "text")
            .map(segment => segment.value)
            .join("");
    }

    private locatePlainIndex(index: number): PlainLocation {
        if (this.plain.length === 0) {
            return { segmentIndex: this.segments.length, offset: 0 };
        }
        const bounded = Math.max(0, Math.min(index, this.plain.length));
        let consumed = 0;
        for (let segmentIndex = 0; segmentIndex < this.segments.length; segmentIndex++) {
            const segment = this.segments[segmentIndex];
            if (segment.type !== "text") {
                continue;
            }
            const next = consumed + segment.value.length;
            if (bounded <= next) {
                return { segmentIndex, offset: bounded - consumed };
            }
            consumed = next;
        }
        return { segmentIndex: this.segments.length, offset: 0 };
    }

    private splitAtPlainIndex(index: number) {
        const location = this.locatePlainIndex(index);
        if (location.segmentIndex >= this.segments.length) {
            return this.segments.length;
        }
        const segment = this.segments[location.segmentIndex];
        if (segment.type !== "text") {
            return location.segmentIndex;
        }
        if (location.offset <= 0) {
            return location.segmentIndex;
        }
        if (location.offset >= segment.value.length) {
            return location.segmentIndex + 1;
        }
        const before: AnsiSegment = { type: "text", value: segment.value.slice(0, location.offset) };
        const after: AnsiSegment = { type: "text", value: segment.value.slice(location.offset) };
        this.segments.splice(location.segmentIndex, 1, before, after);
        return location.segmentIndex + 1;
    }
}
