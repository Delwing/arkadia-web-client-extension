export type TextRange = [start: number, end: number];

export interface HyperlinkFormat {
    id: number;
    title?: string;
}

export interface FormatStyle {
    /** Sequence applied before the segment when serialising to ANSI. */
    ansiOpen?: string;
    /** Sequence applied after the segment when serialising to ANSI. */
    ansiClose?: string;
    /** Optional hyperlink metadata recognised by Mudlet click tags. */
    hyperlink?: HyperlinkFormat;
}

interface BufferSegment {
    text: string;
    style?: FormatStyle;
}

export interface HyperlinkSegment {
    text: string;
    hyperlink?: HyperlinkFormat;
}

export interface TriggerMatchMetadata {
    matches?: RegExpMatchArray;
    type?: string;
    triggerId?: string;
    [key: string]: unknown;
}

function cloneStyle(style?: FormatStyle): FormatStyle | undefined {
    if (!style) return undefined;
    return {
        ansiOpen: style.ansiOpen,
        ansiClose: style.ansiClose,
        hyperlink: style.hyperlink ? { ...style.hyperlink } : undefined,
    };
}

function stylesEqual(a?: FormatStyle, b?: FormatStyle): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const aLink = a.hyperlink;
    const bLink = b.hyperlink;
    const linkEqual = (!aLink && !bLink) || (
        !!aLink &&
        !!bLink &&
        aLink.id === bLink.id &&
        aLink.title === bLink.title
    );
    return (
        a.ansiOpen === b.ansiOpen &&
        a.ansiClose === b.ansiClose &&
        linkEqual
    );
}

function hyperlinksEqual(a?: HyperlinkFormat, b?: HyperlinkFormat): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.id === b.id && a.title === b.title;
}

export class AnsiAwareBuffer {
    private segments: BufferSegment[] = [];

    constructor(initial?: string | BufferSegment[], style?: FormatStyle) {
        if (typeof initial === "string") {
            if (initial.length > 0) {
                this.segments.push({ text: initial, style: cloneStyle(style) });
            }
        } else if (Array.isArray(initial)) {
            this.segments = initial.map(seg => ({ text: seg.text, style: cloneStyle(seg.style) }));
            this.normalizeSegments();
        }
    }

    clone(): AnsiAwareBuffer {
        return new AnsiAwareBuffer(this.getSegments());
    }

    get text(): string {
        return this.segments.map(seg => seg.text).join("");
    }

    get length(): number {
        return this.segments.reduce((total, seg) => total + seg.text.length, 0);
    }

    clear(): void {
        this.segments = [];
    }

    replace(range: TextRange, text: string, style?: FormatStyle): void {
        const [start, end] = range;
        this.assertRange(start, end);
        const fallbackStyle = style ?? this.inferStyle(start);
        this.remove(range);
        if (text.length === 0) return;
        this.insert(start, text, style ?? fallbackStyle);
    }

    insert(index: number, text: string, style?: FormatStyle): void {
        if (text.length === 0) return;
        this.assertIndex(index, true);
        const appliedStyle = cloneStyle(style ?? this.inferStyle(index));
        if (this.segments.length === 0) {
            this.segments.push({ text, style: appliedStyle });
            return;
        }
        if (index === this.length) {
            const last = this.segments[this.segments.length - 1];
            if (stylesEqual(last.style, appliedStyle)) {
                last.text += text;
            } else {
                this.segments.push({ text, style: appliedStyle });
            }
            return;
        }
        const position = this.resolveIndex(index, true);
        if (position.segmentIndex < this.segments.length) {
            this.splitSegment(position.segmentIndex, position.offset);
        }
        const insertionPoint = this.resolveIndex(index, true).segmentIndex;
        const prev = insertionPoint > 0 ? this.segments[insertionPoint - 1] : undefined;
        const next = insertionPoint < this.segments.length ? this.segments[insertionPoint] : undefined;
        const nextStyle = appliedStyle ?? cloneStyle(next?.style) ?? cloneStyle(prev?.style);
        if (prev && stylesEqual(prev.style, nextStyle)) {
            prev.text += text;
        } else if (next && stylesEqual(next.style, nextStyle)) {
            next.text = text + next.text;
        } else {
            this.segments.splice(insertionPoint, 0, { text, style: nextStyle });
        }
        this.normalizeSegments();
    }

    append(text: string, style?: FormatStyle): void {
        this.insert(this.length, text, style);
    }

    prepend(text: string, style?: FormatStyle): void {
        this.insert(0, text, style);
    }

    remove(range: TextRange): void {
        const [start, end] = range;
        this.assertRange(start, end);
        if (start === end) return;
        const startPos = this.resolveIndex(start, true);
        if (startPos.segmentIndex < this.segments.length) {
            this.splitSegment(startPos.segmentIndex, startPos.offset);
        }
        const endPos = this.resolveIndex(end, true);
        if (endPos.segmentIndex < this.segments.length) {
            this.splitSegment(endPos.segmentIndex, endPos.offset);
        }
        const startIndex = this.resolveIndex(start, true).segmentIndex;
        const endIndex = this.resolveIndex(end, true).segmentIndex;
        this.segments.splice(startIndex, endIndex - startIndex);
        this.normalizeSegments();
    }

    /**
     * Serialises the buffer including ANSI sequences and click markers.
     */
    toAnsiString(): string {
        return this.segments.map(seg => this.serializeSegment(seg)).join("");
    }

    /**
     * Returns hyperlink-aware text segments for further processing.
     */
    toHyperlinkSegments(): HyperlinkSegment[] {
        const segments: HyperlinkSegment[] = [];
        for (const seg of this.segments) {
            const hyperlink = seg.style?.hyperlink ? { ...seg.style.hyperlink } : undefined;
            const last = segments[segments.length - 1];
            if (last && hyperlinksEqual(last.hyperlink, hyperlink)) {
                last.text += seg.text;
            } else {
                segments.push({ text: seg.text, hyperlink });
            }
        }
        return segments;
    }

    getSegments(): BufferSegment[] {
        return this.segments.map(seg => ({ text: seg.text, style: cloneStyle(seg.style) }));
    }

    private serializeSegment(segment: BufferSegment): string {
        const { text, style } = segment;
        if (!style) {
            return text;
        }
        const ansiOpen = style.ansiOpen ?? "";
        const ansiClose = style.ansiClose ?? "";
        const hyperlink = style.hyperlink;
        if (!hyperlink) {
            return `${ansiOpen}${text}${ansiClose}`;
        }
        const titleSuffix = hyperlink.title ? `:${hyperlink.title}` : "";
        return `${ansiOpen}{clickOpen:${hyperlink.id}${titleSuffix}}${text}{clickClose}${ansiClose}`;
    }

    private splitSegment(index: number, offset: number): void {
        const segment = this.segments[index];
        if (!segment) return;
        if (offset <= 0 || offset >= segment.text.length) return;
        const before: BufferSegment = { text: segment.text.slice(0, offset), style: cloneStyle(segment.style) };
        const after: BufferSegment = { text: segment.text.slice(offset), style: cloneStyle(segment.style) };
        this.segments.splice(index, 1, before, after);
    }

    private resolveIndex(index: number, allowEnd = false): { segmentIndex: number; offset: number } {
        this.assertIndex(index, allowEnd);
        let remaining = index;
        for (let i = 0; i < this.segments.length; i += 1) {
            const segLen = this.segments[i].text.length;
            if (remaining < segLen || (allowEnd && remaining === segLen)) {
                return { segmentIndex: i, offset: remaining };
            }
            remaining -= segLen;
        }
        return { segmentIndex: this.segments.length, offset: 0 };
    }

    private inferStyle(index: number): FormatStyle | undefined {
        if (this.segments.length === 0) return undefined;
        if (index <= 0) {
            return cloneStyle(this.segments[0].style);
        }
        if (index >= this.length) {
            return cloneStyle(this.segments[this.segments.length - 1].style);
        }
        const before = this.resolveIndex(index - 1, true);
        const segment = this.segments[before.segmentIndex];
        if (before.offset + 1 === segment.text.length) {
            const nextIndex = before.segmentIndex + 1;
            const nextSegment = this.segments[nextIndex];
            if (nextSegment && nextSegment.style && !segment.style) {
                return cloneStyle(nextSegment.style);
            }
        }
        return cloneStyle(segment.style);
    }

    private normalizeSegments(): void {
        const normalized: BufferSegment[] = [];
        for (const seg of this.segments) {
            if (!seg.text) continue;
            const style = cloneStyle(seg.style);
            const last = normalized[normalized.length - 1];
            if (last && stylesEqual(last.style, style)) {
                last.text += seg.text;
            } else {
                normalized.push({ text: seg.text, style });
            }
        }
        this.segments = normalized;
    }

    private assertRange(start: number, end: number): void {
        if (start < 0 || end < start || end > this.length) {
            throw new RangeError(`Invalid range [${start}, ${end}) for buffer of length ${this.length}`);
        }
    }

    private assertIndex(index: number, allowEnd: boolean): void {
        const max = allowEnd ? this.length : this.length - 1;
        if (index < 0 || index > this.length || (!allowEnd && index > max)) {
            throw new RangeError(`Index ${index} is out of bounds for buffer of length ${this.length}`);
        }
    }
}

export default class TriggerLine {
    private readonly buffer: AnsiAwareBuffer;
    private metadata: TriggerMatchMetadata;

    constructor(textOrBuffer: string | AnsiAwareBuffer, metadata: TriggerMatchMetadata = {}) {
        if (typeof textOrBuffer === "string") {
            this.buffer = new AnsiAwareBuffer(textOrBuffer);
        } else {
            this.buffer = textOrBuffer.clone();
        }
        this.metadata = { ...metadata };
    }

    get text(): string {
        return this.buffer.text;
    }

    get length(): number {
        return this.buffer.length;
    }

    get matches(): Readonly<TriggerMatchMetadata> {
        return { ...this.metadata };
    }

    setMatches(metadata: TriggerMatchMetadata): void {
        this.metadata = { ...metadata };
    }

    clearMatches(): void {
        this.metadata = {};
    }

    replace(range: TextRange, text: string, style?: FormatStyle): this {
        this.buffer.replace(range, text, style);
        this.refreshMatchMetadata();
        return this;
    }

    insert(index: number, text: string, style?: FormatStyle): this {
        this.buffer.insert(index, text, style);
        this.refreshMatchMetadata();
        return this;
    }

    append(text: string, style?: FormatStyle): this {
        this.buffer.append(text, style);
        this.refreshMatchMetadata();
        return this;
    }

    prepend(text: string, style?: FormatStyle): this {
        this.buffer.prepend(text, style);
        this.refreshMatchMetadata();
        return this;
    }

    remove(range: TextRange): this {
        this.buffer.remove(range);
        this.refreshMatchMetadata();
        return this;
    }

    /** @internal */
    toAnsiString(): string {
        return this.buffer.toAnsiString();
    }

    /** @internal */
    toHyperlinkSegments(): HyperlinkSegment[] {
        return this.buffer.toHyperlinkSegments();
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
        const clone = [...matches] as RegExpMatchArray;
        clone.index = newIndex;
        if (matches.input) {
            clone.input = plainText;
        }
        if (matches.groups) {
            clone.groups = { ...matches.groups };
        }
        this.metadata = { ...this.metadata, matches: clone };
    }
}

