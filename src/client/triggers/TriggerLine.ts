import {
    AnsiAwareBuffer,
    FormatHyperlink,
    FormatStateSnapshot,
} from "../ansi/FormatState";
import {colorCodes} from "../../modules/core/Colors";

export type TextRange = [start: number, end: number];

export type FormatStyle = FormatStateSnapshot;

export interface HyperlinkSegment {
    text: string;
    hyperlink?: FormatHyperlink;
}

export interface TriggerMatchMetadata {
    matches?: RegExpMatchArray;
    type?: string;
    triggerId?: string;
    [key: string]: unknown;
}

function cloneMatches(matches: RegExpMatchArray): RegExpMatchArray {
    const clone = [...matches] as RegExpMatchArray;
    if (typeof matches.index === "number") {
        clone.index = matches.index;
    }
    if (typeof matches.input === "string") {
        clone.input = matches.input;
    }
    if (matches.groups) {
        clone.groups = { ...matches.groups };
    }
    return clone;
}

export default class TriggerLine {
    private readonly buffer: AnsiAwareBuffer;
    private metadata: TriggerMatchMetadata;
    private readonly mutable: boolean;
    private overrideAnsi?: string;

    private static prepareStyle(styleOrIndex: number | FormatStyle): FormatStyle {
        if (typeof styleOrIndex === "number") {
            // Convert indexed color to RGB using the xterm palette
            const hex = colorCodes.xterm[styleOrIndex];
            if (hex) {
                const value = parseInt(hex.slice(1), 16);
                if (!Number.isNaN(value)) {
                    return {
                        foreground: {
                            space: "rgb",
                            r: (value >> 16) & 0xff,
                            g: (value >> 8) & 0xff,
                            b: value & 0xff,
                        },
                    };
                }
            }
            // Fallback to indexed if conversion fails
            return {
                foreground: {
                    space: "indexed",
                    index: styleOrIndex,
                },
            };
        }
        return {
            ...styleOrIndex,
        };
    }

    private static normaliseRanges(rangeOrRanges: TextRange | TextRange[]): TextRange[] {
        if (Array.isArray(rangeOrRanges)) {
            if (rangeOrRanges.length === 0 || Array.isArray(rangeOrRanges[0])) {
                return rangeOrRanges as TextRange[];
            }
        }
        return [rangeOrRanges as TextRange];
    }

    constructor(
        textOrBuffer: string | AnsiAwareBuffer,
        metadata: TriggerMatchMetadata = {},
        mutable = true,
    ) {
        if (typeof textOrBuffer === "string") {
            this.buffer = new AnsiAwareBuffer(textOrBuffer);
            this.overrideAnsi = textOrBuffer;
        } else {
            this.buffer = textOrBuffer.clone();
            this.overrideAnsi = undefined;
        }
        this.metadata = {
            ...metadata,
            matches: metadata.matches ? cloneMatches(metadata.matches) : undefined,
        };
        this.mutable = mutable;
    }

    get text(): string {
        return this.buffer.text;
    }

    get length(): number {
        return this.buffer.length;
    }

    get matches(): Readonly<TriggerMatchMetadata> {
        return {
            ...this.metadata,
            matches: this.metadata.matches ? cloneMatches(this.metadata.matches) : undefined,
        };
    }

    setMatches(metadata: TriggerMatchMetadata): void {
        this.metadata = {
            ...metadata,
            matches: metadata.matches ? cloneMatches(metadata.matches) : undefined,
        };
    }

    clearMatches(): void {
        const type = this.metadata.type;
        this.metadata = type !== undefined ? { type } : {};
    }

    replace(range: TextRange, text: string, style?: FormatStyle): this {
        if (!this.mutable) return this;
        this.overrideAnsi = undefined;
        this.buffer.replace(range, text, style);
        this.refreshMatchMetadata();
        return this;
    }

    insert(index: number, text: string, style?: FormatStyle): this {
        if (!this.mutable) return this;
        this.overrideAnsi = undefined;
        this.buffer.insert(index, text, style);
        this.refreshMatchMetadata();
        return this;
    }

    append(text: string, style?: FormatStyle): this {
        if (!this.mutable) return this;
        this.overrideAnsi = undefined;
        this.buffer.append(text, style);
        this.refreshMatchMetadata();
        return this;
    }

    prepend(text: string, style?: FormatStyle): this {
        if (!this.mutable) return this;
        this.overrideAnsi = undefined;
        this.buffer.prepend(text, style);
        this.refreshMatchMetadata();
        return this;
    }

    remove(range: TextRange): this {
        if (!this.mutable) return this;
        this.overrideAnsi = undefined;
        this.buffer.remove(range);
        this.refreshMatchMetadata();
        return this;
    }

    color(range: TextRange, color: number | FormatStyle): this;
    color(ranges: TextRange[], color: number | FormatStyle): this;
    color(rangeOrRanges: TextRange | TextRange[], colorOrStyle: number | FormatStyle): this {
        if (!this.mutable) return this;
        const ranges = TriggerLine.normaliseRanges(rangeOrRanges);
        if (ranges.length === 0) return this;
        const style = TriggerLine.prepareStyle(colorOrStyle);
        this.overrideAnsi = undefined;
        for (const [start, end] of ranges) {
            if (start >= end) continue;
            const text = this.text.slice(start, end);
            this.buffer.replace([start, end], text, style);
        }
        this.refreshMatchMetadata();
        return this;
    }

    colorWords(
        words: string | string[],
        color: number | FormatStyle,
        options: { caseInsensitive?: boolean } = {},
    ): this {
        if (!this.mutable) return this;
        const list = Array.isArray(words) ? words : [words];
        if (list.length === 0) return this;
        const caseInsensitive = options.caseInsensitive ?? false;
        const ranges: TextRange[] = [];
        const text = this.text;
        const haystack = caseInsensitive ? text.toLowerCase() : text;
        for (const word of list) {
            if (!word) continue;
            const needle = caseInsensitive ? word.toLowerCase() : word;
            let searchStart = 0;
            while (searchStart <= text.length - word.length) {
                const index = haystack.indexOf(needle, searchStart);
                if (index === -1) break;
                ranges.push([index, index + word.length]);
                searchStart = index + word.length;
            }
        }
        if (ranges.length === 0) return this;
        return this.color(ranges, color);
    }

    isMutable(): boolean {
        return this.mutable;
    }

    /** @internal */
    toAnsiString(): string {
        return this.overrideAnsi ?? this.buffer.toAnsiString();
    }

    /** @internal */
    toHyperlinkSegments(): HyperlinkSegment[] {
        return this.buffer.toHyperlinkSegments();
    }

    /** @internal */
    setOverrideAnsi(text?: string): void {
        this.overrideAnsi = text;
    }

    toString(): string {
        return this.toAnsiString();
    }

    /**
     * Updates the cached match metadata after the buffer mutates.
     */
    private refreshMatchMetadata(): void {
        const matches = this.metadata.matches;
        if (!matches) return;
        const plainText = this.text;
        const newIndex = matches[0] ? plainText.indexOf(matches[0]) : -1;
        if (newIndex === -1) {
            this.metadata = { ...this.metadata, matches: undefined };
            return;
        }
        const clone = cloneMatches(matches);
        clone.index = newIndex;
        clone.input = plainText;
        this.metadata = { ...this.metadata, matches: clone };
    }
}
