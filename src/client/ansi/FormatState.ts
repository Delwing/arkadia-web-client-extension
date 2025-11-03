import {stripAnsiCodes} from "../stripAnsiCodes";

const ESC = "\u001b";

export interface FormatHyperlink {
    id: number;
    title?: string;
}

export interface IndexedColor {
    space: "indexed";
    index: number;
}

export interface RgbColor {
    space: "rgb";
    r: number;
    g: number;
    b: number;
}

export type FormatColor = IndexedColor | RgbColor;

export interface FormatStateSnapshot {
    foreground?: FormatColor;
    background?: FormatColor;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    inverse?: boolean;
    strikethrough?: boolean;
    hyperlink?: FormatHyperlink;
}

interface BufferSegment {
    text: string;
    state?: FormatStateSnapshot;
}

function cloneColor(color?: FormatColor): FormatColor | undefined {
    if (!color) return undefined;
    if (color.space === "indexed") {
        return {space: "indexed", index: color.index};
    }
    return {space: "rgb", r: color.r, g: color.g, b: color.b};
}

function hyperlinksEqual(a?: FormatHyperlink, b?: FormatHyperlink): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.id === b.id && a.title === b.title;
}

function colorsEqual(a?: FormatColor, b?: FormatColor): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.space !== b.space) return false;
    if (a.space === "indexed" && b.space === "indexed") {
        return a.index === b.index;
    }
    if (a.space === "rgb" && b.space === "rgb") {
        return a.r === b.r && a.g === b.g && a.b === b.b;
    }
    return false;
}

function hasVisualFormatting(state?: FormatStateSnapshot): boolean {
    if (!state) return false;
    return !!(
        state.foreground ||
        state.background ||
        state.bold ||
        state.italic ||
        state.underline ||
        state.inverse ||
        state.strikethrough
    );
}

function isDefaultState(state?: FormatStateSnapshot): boolean {
    return !hasVisualFormatting(state) && (!state || !state.hyperlink);
}

function cloneState(state?: FormatStateSnapshot): FormatStateSnapshot | undefined {
    if (!state) return undefined;
    return {
        foreground: cloneColor(state.foreground),
        background: cloneColor(state.background),
        bold: state.bold,
        italic: state.italic,
        underline: state.underline,
        inverse: state.inverse,
        strikethrough: state.strikethrough,
        hyperlink: state.hyperlink ? {...state.hyperlink} : undefined,
    };
}

function statesEqual(a?: FormatStateSnapshot, b?: FormatStateSnapshot): boolean {
    if (isDefaultState(a) && isDefaultState(b)) return true;
    if (!a || !b) return false;
    return (
        colorsEqual(a.foreground, b.foreground) &&
        colorsEqual(a.background, b.background) &&
        !!a.bold === !!b.bold &&
        !!a.italic === !!b.italic &&
        !!a.underline === !!b.underline &&
        !!a.inverse === !!b.inverse &&
        !!a.strikethrough === !!b.strikethrough &&
        hyperlinksEqual(a.hyperlink, b.hyperlink)
    );
}

class FormatState {
    foreground?: FormatColor;
    background?: FormatColor;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    inverse?: boolean;
    strikethrough?: boolean;
    hyperlink?: FormatHyperlink;

    constructor(initial?: FormatStateSnapshot) {
        if (initial) {
            this.applySnapshot(initial);
        }
    }

    private applySnapshot(snapshot: FormatStateSnapshot): void {
        this.foreground = cloneColor(snapshot.foreground);
        this.background = cloneColor(snapshot.background);
        this.bold = snapshot.bold ? true : undefined;
        this.italic = snapshot.italic ? true : undefined;
        this.underline = snapshot.underline ? true : undefined;
        this.inverse = snapshot.inverse ? true : undefined;
        this.strikethrough = snapshot.strikethrough ? true : undefined;
        this.hyperlink = snapshot.hyperlink ? {...snapshot.hyperlink} : undefined;
    }

    reset(): void {
        this.foreground = undefined;
        this.background = undefined;
        this.bold = undefined;
        this.italic = undefined;
        this.underline = undefined;
        this.inverse = undefined;
        this.strikethrough = undefined;
    }

    toSnapshot(): FormatStateSnapshot {
        return {
            foreground: cloneColor(this.foreground),
            background: cloneColor(this.background),
            bold: this.bold ? true : undefined,
            italic: this.italic ? true : undefined,
            underline: this.underline ? true : undefined,
            inverse: this.inverse ? true : undefined,
            strikethrough: this.strikethrough ? true : undefined,
            hyperlink: this.hyperlink ? {...this.hyperlink} : undefined,
        };
    }

    applySgr(params: number[]): void {
        if (params.length === 0) {
            this.reset();
            return;
        }
        for (let i = 0; i < params.length; i += 1) {
            const code = params[i];
            switch (code) {
                case 0:
                    this.reset();
                    break;
                case 1:
                    this.bold = true;
                    break;
                case 3:
                    this.italic = true;
                    break;
                case 4:
                    this.underline = true;
                    break;
                case 7:
                    this.inverse = true;
                    break;
                case 9:
                    this.strikethrough = true;
                    break;
                case 22:
                    this.bold = undefined;
                    break;
                case 23:
                    this.italic = undefined;
                    break;
                case 24:
                    this.underline = undefined;
                    break;
                case 27:
                    this.inverse = undefined;
                    break;
                case 29:
                    this.strikethrough = undefined;
                    break;
                case 39:
                    this.foreground = undefined;
                    break;
                case 49:
                    this.background = undefined;
                    break;
                case 38:
                case 48: {
                    const isForeground = code === 38;
                    const mode = params[i + 1];
                    if (mode === 5 && typeof params[i + 2] === "number") {
                        const color: IndexedColor = {space: "indexed", index: params[i + 2]};
                        if (isForeground) {
                            this.foreground = color;
                        } else {
                            this.background = color;
                        }
                        i += 2;
                    } else if (
                        mode === 2 &&
                        typeof params[i + 2] === "number" &&
                        typeof params[i + 3] === "number" &&
                        typeof params[i + 4] === "number"
                    ) {
                        const color: RgbColor = {
                            space: "rgb",
                            r: params[i + 2],
                            g: params[i + 3],
                            b: params[i + 4],
                        };
                        if (isForeground) {
                            this.foreground = color;
                        } else {
                            this.background = color;
                        }
                        i += 4;
                    }
                    break;
                }
                default:
                    if (code >= 30 && code <= 37) {
                        this.foreground = {space: "indexed", index: code - 30};
                    } else if (code >= 90 && code <= 97) {
                        this.foreground = {space: "indexed", index: code - 82};
                    } else if (code >= 40 && code <= 47) {
                        this.background = {space: "indexed", index: code - 40};
                    } else if (code >= 100 && code <= 107) {
                        this.background = {space: "indexed", index: code - 92};
                    }
                    break;
            }
        }
    }

    setHyperlink(link?: FormatHyperlink): void {
        this.hyperlink = link ? {...link} : undefined;
    }
}

function parseSgrCodes(sequence: string): number[] {
    if (!sequence) return [0];
    return sequence
        .split(";")
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .map(part => Number.parseInt(part, 10))
        .map(num => (Number.isNaN(num) ? 0 : num));
}

function parseHyperlinkPayload(payload: string): FormatHyperlink | undefined {
    const colonIndex = payload.indexOf(":");
    const idPart = colonIndex === -1 ? payload : payload.slice(0, colonIndex);
    const titlePart = colonIndex === -1 ? undefined : payload.slice(colonIndex + 1);
    const id = Number.parseInt(idPart, 10);
    if (Number.isNaN(id)) return undefined;
    const hyperlink: FormatHyperlink = {id};
    if (titlePart && titlePart.length > 0) {
        hyperlink.title = titlePart;
    }
    return hyperlink;
}

function parseAnsiSegments(text: string, baseState?: FormatStateSnapshot): BufferSegment[] {
    const segments: BufferSegment[] = [];
    const state = new FormatState(baseState);
    let buffer = "";
    const flush = (): void => {
        if (!buffer) return;
        const snapshot = state.toSnapshot();
        const storedState = isDefaultState(snapshot) ? undefined : snapshot;
        segments.push({text: buffer, state: storedState});
        buffer = "";
    };
    for (let i = 0; i < text.length;) {
        const char = text[i];
        if (char === ESC && text[i + 1] === "[") {
            const endIndex = text.indexOf("m", i + 2);
            if (endIndex === -1) {
                buffer += text.slice(i);
                break;
            }
            flush();
            const sequence = text.slice(i + 2, endIndex);
            state.applySgr(parseSgrCodes(sequence));
            i = endIndex + 1;
            continue;
        }
        if (text.startsWith("{clickOpen:", i)) {
            const endIndex = text.indexOf("}", i + 11);
            if (endIndex === -1) {
                buffer += text.slice(i);
                break;
            }
            flush();
            const payload = text.slice(i + 11, endIndex);
            const hyperlink = parseHyperlinkPayload(payload);
            state.setHyperlink(hyperlink);
            i = endIndex + 1;
            continue;
        }
        if (text.startsWith("{clickClose}", i)) {
            flush();
            state.setHyperlink(undefined);
            i += "{clickClose}".length;
            continue;
        }
        buffer += char;
        i += 1;
    }
    flush();
    return segments;
}

function stateToAnsi(state?: FormatStateSnapshot): string {
    if (!state) return "";
    const codes: number[] = [];
    if (state.bold) codes.push(1);
    if (state.italic) codes.push(3);
    if (state.underline) codes.push(4);
    if (state.inverse) codes.push(7);
    if (state.strikethrough) codes.push(9);
    if (state.foreground) {
        if (state.foreground.space === "indexed") {
            const index = state.foreground.index;
            codes.push(22, 38, 5, index);
        } else {
            codes.push(22, 38, 2, state.foreground.r, state.foreground.g, state.foreground.b);
        }
    }
    if (state.background) {
        if (state.background.space === "indexed") {
            const index = state.background.index;
            codes.push(48, 5, index);
        } else {
            codes.push(48, 2, state.background.r, state.background.g, state.background.b);
        }
    }
    if (codes.length === 0) return "";
    return `${ESC}[${codes.join(";")}m`;
}

/**
 * Buffer of text aware of ANSI formatting codes and hyperlink metadata.
 */
export class AnsiAwareBuffer {
    private segments: BufferSegment[] = [];

    constructor(initial?: string | BufferSegment[], state?: FormatStateSnapshot) {
        if (typeof initial === "string") {
            this.segments = parseAnsiSegments(initial, state);
            this.normalizeSegments();
        } else if (Array.isArray(initial)) {
            this.segments = initial.map(segment => ({
                text: segment.text,
                state: cloneState(segment.state),
            }));
            this.normalizeSegments();
        } else if (initial === undefined && state) {
            // No initial text, but explicit state should be preserved for future insertions.
            this.segments = [];
        }
    }

    clone(): AnsiAwareBuffer {
        return new AnsiAwareBuffer(this.getSegments());
    }

    get text(): string {
        return this.segments.map(segment => segment.text).join("");
    }

    get length(): number {
        return this.segments.reduce((sum, segment) => sum + segment.text.length, 0);
    }

    clear(): void {
        this.segments = [];
    }

    replace(range: [number, number], text: string, state?: FormatStateSnapshot): void {
        const [start, end] = range;
        this.assertRange(start, end);
        const fallback = state ? undefined : this.inferState(start);
        this.remove(range);
        if (text.length === 0) return;
        this.insertInternal(start, text, state, fallback);
    }

    insert(index: number, text: string, state?: FormatStateSnapshot): void {
        if (text.length === 0) return;
        this.assertIndex(index, true);
        const inferredState = state ? undefined : this.inferState(index);
        this.insertInternal(index, text, state, inferredState);
    }

    private insertInternal(
        index: number,
        text: string,
        explicitState?: FormatStateSnapshot,
        baseState?: FormatStateSnapshot,
    ): void {
        if (text.length === 0) return;
        const insertionSegments = this.createSegmentsFromText(text, explicitState, baseState);
        if (insertionSegments.length === 0) return;
        if (this.segments.length === 0) {
            this.segments = insertionSegments.map(segment => ({
                text: segment.text,
                state: cloneState(segment.state),
            }));
            return;
        }
        if (index === this.length) {
            for (const segment of insertionSegments) {
                this.appendSegmentAtEnd(segment);
            }
            this.normalizeSegments();
            return;
        }
        const position = this.resolveIndex(index, true);
        if (position.segmentIndex < this.segments.length) {
            this.splitSegment(position.segmentIndex, position.offset);
        }
        const insertionPoint = this.resolveBoundaryIndex(index);
        this.segments.splice(insertionPoint, 0, ...insertionSegments.map(segment => ({
            text: segment.text,
            state: cloneState(segment.state),
        })));
        this.normalizeSegments();
    }

    append(text: string, state?: FormatStateSnapshot): void {
        this.insert(this.length, text, state);
    }

    prepend(text: string, state?: FormatStateSnapshot): void {
        this.insert(0, text, state);
    }

    remove(range: [number, number]): void {
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
        const startIndex = this.resolveBoundaryIndex(start);
        const endIndex = this.resolveBoundaryIndex(end);
        this.segments.splice(startIndex, endIndex - startIndex);
        this.normalizeSegments();
    }

    /** @internal */
    getSegments(): BufferSegment[] {
        return this.segments.map(segment => ({
            text: segment.text,
            state: cloneState(segment.state),
        }));
    }

    /**
     * Serialises the buffer back into ANSI encoded text.
     */
    toAnsiString(): string {
        let serialized = "";
        for (const segment of this.segments) {
            const state = segment.state;
            const ansiOpen = stateToAnsi(state);
            const hyperlinkOpen = state?.hyperlink
                ? `{clickOpen:${state.hyperlink.id}${state.hyperlink.title ? `:${state.hyperlink.title}` : ""}}`
                : "";
            const hyperlinkClose = state?.hyperlink ? "{clickClose}" : "";
            const ansiClose = hasVisualFormatting(state) ? `${ESC}[0m` : "";
            serialized += `${ansiOpen}${hyperlinkOpen}${segment.text}${hyperlinkClose}${ansiClose}`;
        }
        return serialized;
    }

    /**
     * Returns hyperlink-aware text segments for further processing.
     */
    toHyperlinkSegments(): { text: string; hyperlink?: FormatHyperlink }[] {
        const segments: { text: string; hyperlink?: FormatHyperlink }[] = [];
        for (const segment of this.segments) {
            const link = segment.state?.hyperlink ? {...segment.state.hyperlink} : undefined;
            const last = segments[segments.length - 1];
            if (last && hyperlinksEqual(last.hyperlink, link)) {
                last.text += segment.text;
            } else {
                segments.push({text: segment.text, hyperlink: link});
            }
        }
        return segments;
    }

    private appendSegmentAtEnd(segment: BufferSegment): void {
        const last = this.segments[this.segments.length - 1];
        if (last && statesEqual(last.state, segment.state)) {
            last.text += segment.text;
        } else {
            this.segments.push({text: segment.text, state: cloneState(segment.state)});
        }
    }

    private createSegmentsFromText(
        text: string,
        explicitState?: FormatStateSnapshot,
        baseState?: FormatStateSnapshot,
    ): BufferSegment[] {
        if (!text) return [];
        if (explicitState) {
            const cleanText = stripAnsiCodes(text);
            if (cleanText.length === 0) return [];
            return [{text: cleanText, state: isDefaultState(explicitState) ? undefined : cloneState(explicitState)}];
        }
        if (!text.includes(ESC) && !text.includes("{clickOpen:") && !text.includes("{clickClose}")) {
            const state = baseState && !isDefaultState(baseState) ? cloneState(baseState) : undefined;
            return [{text, state}];
        }
        return parseAnsiSegments(text, baseState);
    }

    private resolveIndex(index: number, allowEnd = false): { segmentIndex: number; offset: number } {
        this.assertIndex(index, allowEnd);
        let remaining = index;
        for (let i = 0; i < this.segments.length; i += 1) {
            const length = this.segments[i].text.length;
            if (remaining < length || (allowEnd && remaining === length)) {
                return {segmentIndex: i, offset: remaining};
            }
            remaining -= length;
        }
        return {segmentIndex: this.segments.length, offset: 0};
    }

    private resolveBoundaryIndex(index: number): number {
        const position = this.resolveIndex(index, true);
        const {segmentIndex, offset} = position;
        if (segmentIndex >= this.segments.length) {
            return this.segments.length;
        }
        if (offset <= 0) {
            return segmentIndex;
        }
        if (offset >= this.segments[segmentIndex].text.length) {
            return segmentIndex + 1;
        }
        return segmentIndex;
    }

    private inferState(index: number): FormatStateSnapshot | undefined {
        if (this.segments.length === 0) return undefined;
        if (index <= 0) return cloneState(this.segments[0].state);
        if (index >= this.length) return cloneState(this.segments[this.segments.length - 1].state);
        const before = this.resolveIndex(index - 1, true);
        const segment = this.segments[before.segmentIndex];
        if (before.offset + 1 === segment.text.length) {
            const nextSegment = this.segments[before.segmentIndex + 1];
            if (nextSegment && nextSegment.state && !segment.state) {
                return cloneState(nextSegment.state);
            }
        }
        return cloneState(segment.state);
    }

    private splitSegment(index: number, offset: number): void {
        const segment = this.segments[index];
        if (!segment) return;
        if (offset <= 0 || offset >= segment.text.length) return;
        const before: BufferSegment = {text: segment.text.slice(0, offset), state: cloneState(segment.state)};
        const after: BufferSegment = {text: segment.text.slice(offset), state: cloneState(segment.state)};
        this.segments.splice(index, 1, before, after);
    }

    private normalizeSegments(): void {
        const normalized: BufferSegment[] = [];
        for (const segment of this.segments) {
            if (!segment.text) continue;
            const state = isDefaultState(segment.state) ? undefined : cloneState(segment.state);
            const last = normalized[normalized.length - 1];
            if (last && statesEqual(last.state, state)) {
                last.text += segment.text;
            } else {
                normalized.push({text: segment.text, state});
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
        if (index < 0 || index > this.length || (!allowEnd && index >= this.length)) {
            throw new RangeError(`Index ${index} is out of bounds for buffer of length ${this.length}`);
        }
    }
}

export {cloneState as cloneFormatState, statesEqual as formatStatesEqual};
