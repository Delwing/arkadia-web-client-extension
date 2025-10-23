import {
    AnsiAwareBuffer,
    FormatHyperlink,
    FormatStateSnapshot,
} from "../ansi/FormatState";

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
