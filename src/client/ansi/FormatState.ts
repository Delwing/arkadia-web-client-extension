import {colorCodes} from "@modules/core/Colors.ts";
import mudletColorsJson from "@client/colors.json";
import {matchGroupRange, toFormatColor, toFormatState, toHyperlink} from "./style";
import type {ColorInput, LinkInput, StyleInput} from "./style";

export type {ColorInput, LinkInput, StyleInput, StyleSpec} from "./style";

const ESC = "\u001b";

/** Hyperlink with callbacks */
export interface FormatHyperlink {
    onClick?: (ev: MouseEvent) => void;
    onContextMenu?: (ev: MouseEvent) => void;  // right click
    onMouseEnter?: (ev: MouseEvent) => void;
    onMouseLeave?: (ev: MouseEvent) => void;
    title?: string;
}

/** Indexed color (0-255) */
export interface IndexedColor {
    space: "indexed";
    index: number;
}

/** RGB color */
export interface RgbColor {
    space: "rgb";
    r: number;
    g: number;
    b: number;
}

/** Hexadecimal color */
export interface HexColor {
    space: "hex";
    color: string;
}

/** Any of the color formats */
export type FormatColor = IndexedColor | RgbColor | HexColor

/** The CSS easings a dim effect may use. The one list: validators and the editor read it. */
export const DIM_EASINGS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'] as const;

export type DimEasing = typeof DIM_EASINGS[number];

export function isDimEasing(value: unknown): value is DimEasing {
    return typeof value === 'string' && (DIM_EASINGS as readonly string[]).includes(value);
}

export interface DimEffect {
    startOpacity: number;  // 0-1
    endOpacity: number;    // 0-1
    duration: number;      // ms
    easing?: DimEasing;    // defaults to 'ease-in-out'
}

/** Complete formatting state for text */
export interface FormatStateSnapshot {
    foreground?: FormatColor;
    background?: FormatColor;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    inverse?: boolean;
    strikethrough?: boolean;
    slowBlink?: boolean;
    rapidBlink?: boolean;
    dim?: DimEffect;
    hyperlink?: FormatHyperlink;
    cssClass?: string;
}

/** Text range [start, end) for applying formatting */
export type TextRange = [start: number, end: number];

/** What `AnsiAwareBuffer.select` can select: trigger matches, text, a regex or a range */
export type SelectTarget = RegExpMatchArray | string | RegExp | TextRange;

function isTextRange(target: SelectTarget): target is TextRange {
    return Array.isArray(target) && target.length === 2 && typeof target[0] === "number";
}

/** Buffer segment with text and optional formatting state */
export interface BufferSegment {
    text: string;
    state?: FormatStateSnapshot;
}

function cloneColor(color?: FormatColor): FormatColor | undefined {
    if (!color) return undefined;
    if (color.space === "indexed") {
        return {space: "indexed", index: color.index};
    }
    if (color.space === "hex") {
        return {space: "hex", color: color.color};
    }
    return {space: "rgb", r: color.r, g: color.g, b: color.b};
}

function hyperlinksEqual(a?: FormatHyperlink, b?: FormatHyperlink): boolean {
    // Since hyperlinks now carry callbacks (functions), we can't meaningfully compare them by value.
    // We consider hyperlinks equal only if both are undefined.
    // This ensures each hyperlink segment remains separate.
    return !a && !b;

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
    if (a.space === "hex" && b.space === "hex") {
        return a.color === b.color;
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
        state.strikethrough ||
        state.slowBlink ||
        state.rapidBlink ||
        state.dim ||
        state.cssClass
    );
}

function dimEffectsEqual(a?: DimEffect, b?: DimEffect): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
        a.startOpacity === b.startOpacity &&
        a.endOpacity === b.endOpacity &&
        a.duration === b.duration &&
        (a.easing || 'ease-in-out') === (b.easing || 'ease-in-out')
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
        slowBlink: state.slowBlink,
        rapidBlink: state.rapidBlink,
        dim: state.dim ? {...state.dim} : undefined,
        hyperlink: state.hyperlink ? {...state.hyperlink} : undefined,
        cssClass: state.cssClass,
    };
}

/**
 * `base` with every field `style` sets laid over it. A field left out of
 * `style`, or set to undefined, keeps the base's value, so colouring text keeps
 * its link, background and the rest; `false` turns a flag off.
 */
function overlayState(base: FormatStateSnapshot | undefined, style: FormatStateSnapshot): FormatStateSnapshot {
    const result: FormatStateSnapshot = cloneState(base) ?? {};
    const patch = cloneState(style)!;
    for (const key of Object.keys(patch) as (keyof FormatStateSnapshot)[]) {
        if (patch[key] !== undefined) {
            (result as Record<string, unknown>)[key] = patch[key];
        }
    }
    return result;
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
        !!a.slowBlink === !!b.slowBlink &&
        !!a.rapidBlink === !!b.rapidBlink &&
        dimEffectsEqual(a.dim, b.dim) &&
        hyperlinksEqual(a.hyperlink, b.hyperlink) &&
        a.cssClass === b.cssClass
    );
}

class FormatState {

    static DEFAULT = {}

    foreground?: FormatColor;
    background?: FormatColor;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    inverse?: boolean;
    strikethrough?: boolean;
    slowBlink?: boolean;
    rapidBlink?: boolean;
    dim?: DimEffect;
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
        this.slowBlink = snapshot.slowBlink ? true : undefined;
        this.rapidBlink = snapshot.rapidBlink ? true : undefined;
        this.dim = snapshot.dim ? {...snapshot.dim} : undefined;
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
        this.slowBlink = undefined;
        this.rapidBlink = undefined;
        this.dim = undefined;
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
            slowBlink: this.slowBlink ? true : undefined,
            rapidBlink: this.rapidBlink ? true : undefined,
            dim: this.dim ? {...this.dim} : undefined,
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
                    // Ignore bold from ANSI input - only allow programmatic bold via triggers
                    break;
                case 3:
                    this.italic = true;
                    break;
                case 4:
                    this.underline = true;
                    break;
                case 5:
                    this.slowBlink = true;
                    break;
                case 6:
                    this.rapidBlink = true;
                    break;
                case 7:
                    this.inverse = true;
                    break;
                case 9:
                    this.strikethrough = true;
                    break;
                case 22:
                    // Ignore bold reset from ANSI input
                    break;
                case 23:
                    this.italic = undefined;
                    break;
                case 24:
                    this.underline = undefined;
                    break;
                case 25:
                    this.slowBlink = undefined;
                    this.rapidBlink = undefined;
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
                        const color: HexColor = {space: "hex", color: colorCodes.xterm[params[i + 2]]};
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
                        if (params[1] === 1) {
                            this.foreground = {space: "hex", color: colorCodes.ansi.bright[code - 30]};
                        } else {
                            this.foreground = {space: "hex", color: colorCodes.ansi.dark[code - 30]};
                        }
                    } else if (code >= 90 && code <= 97) {
                        this.foreground = {space: "hex", color: colorCodes.ansi.bright[code - 82]};
                    } else if (code >= 40 && code <= 47) {
                        this.background = {space: "hex", color: colorCodes.ansi.bright[code - 40]};
                    } else if (code >= 100 && code <= 107) {
                        this.background = {space: "hex", color: colorCodes.ansi.bright[code - 92]};
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
        buffer += char;
        i += 1;
    }
    flush();
    return segments;
}

/** `count` characters of `fill`, repeated and cut to length ('' for none). */
function makePadding(count: number, fill: string): string {
    if (count <= 0 || !fill) return "";
    return fill.repeat(Math.ceil(count / fill.length)).slice(0, count);
}

/** One recorded mutation: `removed` characters at `start` became `inserted` ones. */
interface BufferEdit {
    start: number;
    removed: number;
    inserted: number;
}

/**
 * Moves a position across one edit. `isStart` decides which side of text
 * inserted exactly at the position it lands on: a range start moves past it, a
 * range end stays before it, so insertions around a range stay outside it.
 */
function mapEditPosition(position: number, edit: BufferEdit, isStart: boolean): number {
    const {start, removed, inserted} = edit;
    if (position < start) return position;
    if (removed === 0) {
        if (position === start && !isStart) return position;
        return position + inserted;
    }
    if (position >= start + removed) return position + inserted - removed;
    return start + Math.min(position - start, inserted);
}

/**
 * Buffer of text aware of ANSI formatting codes and hyperlink metadata.
 */
/**
 * A line of text with ANSI formatting: color and style information per
 * character. Members tagged `@internal` are left out of the plugin types.
 */
export class AnsiAwareBuffer {
    private segments: BufferSegment[] = [];
    private _deleted = false;
    private _onRender?: (container: HTMLElement) => void;
    private _textCache: string | null = null;
    private _lengthCache: number | null = null;
    originalText?: string;
    /**
     * Category marker for a decorated message block (e.g. 'ekwipunek', 'lup').
     * Set by a trigger, read by the host when it builds the message node, which
     * turns it into a `msg-flair msg-flair-<name>` class pair. Rides the buffer
     * — like `originalText` — so no signature in the output chain has to know
     * about it, and it survives the split-view sticky rebuild (which re-renders
     * the same buffer) unlike `onRender`, which is cleared after firing once.
     */
    flair?: string;
    /**
     * Edits made since `trackEditsFrom` anchored the buffer, so a range found in
     * the text as the MUD sent it can be located in the text as earlier triggers
     * left it (see `mapOriginalRange`). `_editBase` is null while untracked.
     */
    private _editBase: string | null = null;
    private _edits: BufferEdit[] = [];
    private _editDepth = 0;
    /** Where `trackEditsThrough` placed the original text, before `_edits` apply. */
    private _baseMap: ((range: TextRange) => TextRange) | null = null;
    /** Ranges of live selections, moved by every edit (see `anchor`). */
    private _anchors = new Set<{ start: number; end: number }>();

    /**
     * Create a new AnsiAwareBuffer
     * @param initial - Initial text with ANSI codes, array of segments, or undefined
     * @param state - Optional default formatting state
     *
     * @example
     * // Create empty buffer
     * const buffer = new AnsiAwareBuffer();
     *
     * // Create from plain text
     * const buffer = new AnsiAwareBuffer("Hello world");
     *
     * // Create from text with default formatting
     * const buffer = new AnsiAwareBuffer("Hello", api.colors.fromHex('#ff0000'));
     *
     * // Create from ANSI string
     * const buffer = new AnsiAwareBuffer("\x1b[31mRed text\x1b[0m");
     *
     * // Create from segments
     * const segments: BufferSegment[] = [
     *   { text: "Hello ", state: api.colors.fromHex('#00ff00') },
     *   { text: "world", state: api.colors.fromHex('#0000ff') }
     * ];
     * const buffer = new AnsiAwareBuffer(segments);
     */
    constructor(initial?: string | BufferSegment[], style?: StyleInput) {
        const state = toFormatState(style);
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

    /**
     * @internal
     */
    get deleted(): boolean {
        return this._deleted;
    }

    /**
     * @internal
     */
    markAsDeleted(): this {
        this._deleted = true;
        return this;
    }

    /**
     * Registers a callback to be invoked when this buffer is rendered to the DOM.
     * The callback receives the container element where the content was appended.
     */
    onRender(callback: (container: HTMLElement) => void): this {
        this._onRender = callback;
        return this;
    }

    /**
     * Called by the output handler after the buffer content is appended to the DOM.
     * @internal
     */
    notifyRender(container: HTMLElement): void {
        if (this._onRender) {
            this._onRender(container);
            this._onRender = undefined; // Clear after calling
        }
    }

    /**
     * Create a deep copy of this buffer
     */
    clone(): AnsiAwareBuffer {
        const copy = new AnsiAwareBuffer(this.getSegments());
        copy.flair = this.flair;
        return copy;
    }

    /**
     * The plain text content without formatting
     */
    get text(): string {
        if (this._textCache === null) {
            this._textCache = this.segments.map(segment => segment.text).join("");
        }
        return this._textCache;
    }

    /**
     * The total character length
     */
    get length(): number {
        if (this._lengthCache === null) {
            let length = 0;
            for (const segment of this.segments) length += segment.text.length;
            this._lengthCache = length;
        }
        return this._lengthCache;
    }

    /**
     * Clear all content from the buffer
     */
    clear(): this {
        this.recordEdit(0, this.length, () => {
            this.segments = [];
            this.invalidateCaches();
        });
        return this;
    }

    /**
     * Starts (or keeps) recording edits relative to `original`, the text a
     * trigger pass matches against. Recording starts afresh when the buffer
     * still reads `original`, carries on when it was already anchored to it, and
     * stops otherwise — the buffer was rewritten in a way nothing recorded, so
     * `mapOriginalRange` can no longer place original offsets.
     *
     * @internal
     */
    trackEditsFrom(original: string): this {
        if (this.text === original) {
            this._editBase = original;
            this._edits = [];
            this._baseMap = null;
        } else if (this._editBase !== original) {
            this._editBase = null;
            this._edits = [];
            this._baseMap = null;
        }
        return this;
    }

    /**
     * Anchors this buffer to `original` although it no longer reads it: `map`
     * places a range of `original` in the text as it is now, and edits from
     * here on are recorded on top. For a line split out of a multiline buffer
     * a multiline trigger rewrote — the split line has no edit history of its
     * own, but the multiline buffer's tells where each original line went.
     *
     * @internal
     */
    trackEditsThrough(original: string, map: (range: TextRange) => TextRange): this {
        this._editBase = original;
        this._edits = [];
        this._baseMap = map;
        return this;
    }

    /** @internal The text `trackEditsFrom` anchored to, or null while edits are untracked. */
    get trackedOriginal(): string | null {
        return this._editBase;
    }

    /**
     * Where a range of the anchored original text (see `trackEditsFrom`) sits in
     * the current text. Trigger matches are offsets into the line as the MUD sent
     * it, while earlier triggers may already have prefixed or rewritten it; this
     * follows every recorded edit so the range still covers the same characters.
     *
     * Text inserted right at the range's start or end stays outside it. Where the
     * range starts or ends inside rewritten text, it keeps the same offset into
     * the rewrite, clamped to its length, so recolouring (same text replaced)
     * keeps the range exact. An untracked buffer returns the range unchanged.
     *
     * @internal
     */
    mapOriginalRange(range: TextRange): TextRange {
        if (this._editBase === null || (this._edits.length === 0 && !this._baseMap)) return range;
        let [start, end] = this._baseMap ? this._baseMap(range) : range;
        for (const edit of this._edits) {
            start = mapEditPosition(start, edit, true);
            end = mapEditPosition(end, edit, false);
        }
        const length = this.length;
        start = Math.min(Math.max(start, 0), length);
        end = Math.min(Math.max(end, start), length);
        return [start, end];
    }

    /**
     * Runs a mutation of `[start, start + removed)` and records it as one edit,
     * however many primitive steps it takes (a replace is a remove plus an
     * insert, but recording it as two would collapse ranges inside it).
     */
    private recordEdit(start: number, removed: number, mutate: () => void): void {
        if ((this._editBase === null && this._anchors.size === 0) || this._editDepth > 0) {
            mutate();
            return;
        }
        const before = this.length;
        this._editDepth++;
        try {
            mutate();
        } finally {
            this._editDepth--;
        }
        const inserted = this.length - (before - removed);
        if (removed === 0 && inserted === 0) return;
        const edit = {start, removed, inserted};
        if (this._editBase !== null) this._edits.push(edit);
        for (const anchor of this._anchors) {
            anchor.start = mapEditPosition(anchor.start, edit, true);
            anchor.end = Math.max(anchor.start, mapEditPosition(anchor.end, edit, false));
        }
    }

    /**
     * A range that follows this buffer's later edits, like a trigger range does:
     * text inserted at its edges stays outside, text replaced inside it stays in.
     * @internal
     */
    anchor(range: TextRange): { start: number; end: number } {
        const anchor = {start: range[0], end: range[1]};
        this._anchors.add(anchor);
        return anchor;
    }

    /**
     * Select text to change it: the match a trigger fired on (or one of its
     * capture groups), the first occurrence of a string or regex, a range, or —
     * with no argument — the whole line. The selection follows later edits, so
     * calls can be chained without counting positions. When nothing is found
     * the selection is empty and every change on it does nothing.
     *
     * Trigger `matches` are positions in the line as the game sent it; `select`
     * maps them onto the line as earlier triggers left it. A string or regex is
     * searched in the line as it is now.
     *
     * @param target - `matches` from a trigger, a string, a RegExp, a `[start, end)` range, or nothing
     * @param group - capture group number or name (for `matches` and RegExp targets)
     *
     * @example
     * ```typescript
     * api.triggers.register(/^(\w+) flakonik/, (line, matches) => {
     *   line.select(matches, 1).fg('gold').after(' (leczenie)', { fg: 'gray' });
     *   return line;
     * });
     * line.select().fg('#ff0000');                 // whole line
     * line.select('miecz').bold().link(() => api.command.send('wez miecz'));
     * ```
     */
    select(target?: SelectTarget, group?: number | string): TextSelection {
        return new TextSelection(this, this.locate(target, group, false));
    }

    /**
     * Select every occurrence of a string or regex in the line as it is now.
     * @param target - Text or RegExp to find (a RegExp needn't have the `g` flag)
     * @param group - capture group number or name to select instead of the whole match
     * @param options - `caseInsensitive` for string targets
     *
     * @example
     * ```typescript
     * line.selectAll('zloto', 0, { caseInsensitive: true }).fg('gold');
     * line.selectAll(/(\d+) mithrylow/, 1).bold();
     * ```
     */
    selectAll(
        target: string | RegExp,
        group?: number | string,
        options: { caseInsensitive?: boolean } = {},
    ): TextSelection {
        return new TextSelection(this, this.locate(target, group, true, options.caseInsensitive));
    }

    private locate(
        target: SelectTarget | undefined,
        group: number | string | undefined,
        all: boolean,
        caseInsensitive = false,
    ): TextRange[] {
        if (target === undefined) return [[0, this.length]];
        if (typeof target === "string") {
            if (!target) return [];
            const haystack = caseInsensitive ? this.text.toLowerCase() : this.text;
            const needle = caseInsensitive ? target.toLowerCase() : target;
            const ranges: TextRange[] = [];
            for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
                ranges.push([i, i + needle.length]);
                if (!all) break;
            }
            return ranges;
        }
        if (target instanceof RegExp) {
            const flags = target.flags.replace(/[gy]/g, "");
            const regex = new RegExp(target.source, flags + "g" + (flags.includes("d") ? "" : "d"));
            const ranges: TextRange[] = [];
            for (const match of this.text.matchAll(regex)) {
                if (match[0].length === 0) continue;
                const range = matchGroupRange(match, group);
                if (range) ranges.push(range);
                if (!all && ranges.length) break;
            }
            return ranges;
        }
        if (isTextRange(target)) {
            this.assertRange(target[0], target[1]);
            return [[target[0], target[1]]];
        }
        const range = matchGroupRange(target, group, this.trackedOriginal ?? this.text);
        return range ? [this.mapOriginalRange(range)] : [];
    }

    /**
     * Replace text in a range
     * @param range - [start, end] indices
     * @param text - New text to insert
     * @param state - Optional formatting to apply
     */
    replace(range: TextRange, text: string, style?: StyleInput): this {
        const state = toFormatState(style);
        const [start, end] = range;
        this.assertRange(start, end);
        this.recordEdit(start, end - start, () => {
            const fallback = state ? undefined : this.inferState(start);
            this.remove(range);
            if (text.length === 0) return;
            this.insertInternal(start, text, state, fallback);
        });
        return this;
    }

    /**
     * Replace a range with another buffer, keeping its formatting
     * @param range - [start, end] indices
     * @param buffer - Buffer to put in its place
     */
    replaceBuffer(range: TextRange, buffer: AnsiAwareBuffer): this {
        const [start, end] = range;
        this.assertRange(start, end);
        this.recordEdit(start, end - start, () => {
            this.remove(range);
            if (buffer.length === 0) return;
            this.insertBuffer(start, buffer);
        });
        return this;
    }

    /**
     * Insert text at an index
     * @param index - Position to insert at
     * @param text - Text to insert
     * @param state - Optional formatting to apply
     */
    insert(index: number, text: string, style?: StyleInput): this {
        if (text.length === 0) return this;
        const state = toFormatState(style);
        this.assertIndex(index, true);
        this.recordEdit(index, 0, () => {
            const inferredState = state ? undefined : this.inferState(index);
            this.insertInternal(index, text, state, inferredState);
        });
        return this;
    }

    /**
     * Insert another buffer at an index
     * @param index - Position to insert at
     * @param buffer - Buffer to insert
     */
    insertBuffer(index: number, buffer: AnsiAwareBuffer): this {
        if (buffer.length === 0) return this;
        this.assertIndex(index, true);
        this.recordEdit(index, 0, () => this.insertBufferInternal(index, buffer));
        return this;
    }

    private insertBufferInternal(index: number, buffer: AnsiAwareBuffer): void {

        const sourceSegments = buffer.getSegments();
        if (sourceSegments.length === 0) return;

        // getSegments() already handed us private copies, so their states need no second clone.
        if (index === this.length) {
            this.appendNormalized(sourceSegments, false);
            return;
        }

        const position = this.resolveIndex(index, true);
        if (position.segmentIndex < this.segments.length) {
            this.splitSegment(position.segmentIndex, position.offset);
        }

        const insertionPoint = this.resolveBoundaryIndex(index);
        this.segments.splice(insertionPoint, 0, ...sourceSegments);
        this.normalizeSegments();
    }

    /**
     * Add text to the beginning of the line, unformatted unless `state` is
     * given. Unlike `prepend`, it never picks up the formatting (or link) of the
     * text it is put in front of.
     */
    prefix(text: string, state?: StyleInput): this {
        this.insert(0, text, state ?? {});
        return this;
    }

    /**
     * Add text to the end of the line, unformatted unless `state` is given.
     * Unlike `append`, it never picks up the formatting (or link) of the text
     * before it.
     */
    suffix(text: string, state?: StyleInput): this {
        this.insert(this.length, text, state ?? {});
        return this;
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
        if (index === this.length) {
            this.appendNormalized(insertionSegments, true);
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

    /**
     * Add text to the end of the line
     * @param text - Text to append
     * @param state - Optional formatting to apply
     */
    append(text: string, state?: StyleInput): this {
        this.insert(this.length, text, state);
        return this;
    }

    /**
     * Append another buffer to the end
     * @param buffer - Buffer to append
     */
    appendBuffer(buffer: AnsiAwareBuffer): this {
        this.insertBuffer(this.length, buffer);
        return this;
    }

    /**
     * Add text to the beginning of the line
     * @param text - Text to prepend
     * @param state - Optional formatting to apply
     */
    prepend(text: string, state?: StyleInput): this {
        this.insert(0, text, state);
        return this;
    }

    /**
     * Prepend another buffer to the beginning
     * @param buffer - Buffer to prepend
     */
    prependBuffer(buffer: AnsiAwareBuffer): this {
        this.insertBuffer(0, buffer);
        return this;
    }

    /**
     * Remove text in a range
     * @param range - [start, end] indices
     */
    remove(range: TextRange): this {
        const [start, end] = range;
        this.assertRange(start, end);
        if (start === end) return this;
        this.recordEdit(start, end - start, () => this.removeInternal(start, end));
        return this;
    }

    private removeInternal(start: number, end: number): void {
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
     * Returns hyperlink-aware text segments for further processing.
     *
     * @internal
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

    /**
     * Colour or format a text range. Only what `color` sets changes: a link on
     * the text, its background, underline and any other formatting it already
     * has are kept, character by character. Use `restyle` to replace the
     * formatting outright.
     * @param range - [start, end) indices
     * @param color - xterm palette index (0-255) for the foreground, or a
     *                format such as `api.colors.fromHex('#ff0000')`
     *
     * @example
     * ```typescript
     * line.color([0, line.length], api.colors.fromHex('#ffd700'));
     * line.color([0, 5], { background: { space: 'hex', color: '#330000' }, bold: true });
     * ```
     */
    color(range: TextRange, color: number | StyleInput): this {
        const style = this.prepareStyle(color);
        const [start, end] = range;
        if (start >= end) return this;
        this.mapStates(range, state => overlayState(state, style));
        return this;
    }

    /**
     * Same as `color` with a format: lays `format` over the formatting each
     * character in the range already has, keeping everything it doesn't set.
     */
    applyFormat(range: TextRange, format: StyleInput): this {
        return this.color(range, format);
    }

    /**
     * Replaces the formatting of a range with exactly `state`, dropping what was
     * there before — colours, styles and links alike. The text stays as it is.
     * Prefer `color`, which keeps what it doesn't set; use this to clear a
     * range's formatting (`restyle(range, {})`) or reset it to a known state.
     */
    restyle(range: TextRange, state: StyleInput): this {
        const [start, end] = range;
        if (start >= end) return this;
        const style = toFormatState(state);
        this.mapStates(range, () => cloneState(style));
        return this;
    }

    /**
     * Rewrites the state of every character in `range`, piece by piece, leaving
     * the text untouched. It changes no text, so it records no edit and keeps
     * every tracked range where it was.
     */
    private mapStates(
        range: TextRange,
        fn: (state: FormatStateSnapshot | undefined) => FormatStateSnapshot | undefined,
    ): void {
        const [start, end] = range;
        this.assertRange(start, end);
        if (start === end) return;
        for (const boundary of [start, end]) {
            const position = this.resolveIndex(boundary, true);
            if (position.segmentIndex < this.segments.length) {
                this.splitSegment(position.segmentIndex, position.offset);
            }
        }
        let pos = 0;
        for (const segment of this.segments) {
            const segStart = pos;
            pos += segment.text.length;
            if (segStart >= start && pos <= end) {
                segment.state = fn(cloneState(segment.state));
            }
        }
        this.normalizeSegments();
    }

    /**
     * Apply color/formatting to specific words throughout the buffer
     * @param words - Single word or array of words to colorize
     * @param color - Color index (0-255) or full FormatStateSnapshot
     * @param options - Search options (caseInsensitive)
     *
     * @example
     * ```typescript
     * // Color a single word
     * line.colorWords("gold", api.colors.fromHex('#ffd700'));
     *
     * // Color multiple words
     * line.colorWords(["red", "blue"], 196, { caseInsensitive: true });
     * ```
     */
    colorWords(
        words: string | string[],
        color: number | StyleInput,
        options: { caseInsensitive?: boolean } = {},
    ): this {
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
        ranges.forEach(range => this.color(range, color));
        return this
    }

    /**
     * Splits the buffer by newline characters (\n) into an array of AnsiAwareBuffer instances.
     * Each line preserves its formatting state from the original buffer.
     */
    splitLines(): AnsiAwareBuffer[] {
        const lines: AnsiAwareBuffer[] = [];
        let currentLineSegments: BufferSegment[] = [];

        for (const segment of this.segments) {
            const text = segment.text;
            let lastIndex = 0;

            for (let i = 0; i < text.length; i++) {
                if (text[i] === "\n") {
                    // Add text before the newline to current line
                    if (i > lastIndex) {
                        currentLineSegments.push({
                            text: text.slice(lastIndex, i),
                            state: cloneState(segment.state),
                        });
                    }

                    // Create a new buffer for the current line
                    lines.push(new AnsiAwareBuffer(currentLineSegments));
                    currentLineSegments = [];
                    lastIndex = i + 1;
                }
            }

            // Add remaining text after last newline (or entire segment if no newlines)
            if (lastIndex < text.length) {
                currentLineSegments.push({
                    text: text.slice(lastIndex),
                    state: cloneState(segment.state),
                });
            }
        }

        // Add the last line if there are any segments
        if (currentLineSegments.length > 0) {
            lines.push(new AnsiAwareBuffer(currentLineSegments));
        }

        // If the buffer was empty, return an array with one empty buffer
        if (lines.length === 0) {
            lines.push(new AnsiAwareBuffer());
        }

        return lines;
    }

    /**
     * A copy of part of the line, formatting and links included. Like
     * `String.slice`, but positions outside the line are clamped and negative
     * ones are not counted from the end.
     */
    slice(start: number = 0, end: number = this.length): AnsiAwareBuffer {
        const from = Math.max(0, Math.min(start, this.length));
        const to = Math.max(from, Math.min(end, this.length));
        const pieces: BufferSegment[] = [];
        let pos = 0;
        for (const segment of this.segments) {
            const segStart = pos;
            pos += segment.text.length;
            if (pos <= from) continue;
            if (segStart >= to) break;
            pieces.push({
                text: segment.text.slice(Math.max(0, from - segStart), Math.min(segment.text.length, to - segStart)),
                state: segment.state,
            });
        }
        return new AnsiAwareBuffer(pieces);
    }

    /**
     * Pads the end of the line to `width` characters. The padding is always
     * unformatted, so it never picks up a colour, background or link.
     */
    padEnd(width: number, fill: string = " "): this {
        const padding = makePadding(width - this.length, fill);
        if (padding) this.insert(this.length, padding, {});
        return this;
    }

    /** Pads the start of the line to `width` characters, with unformatted padding. */
    padStart(width: number, fill: string = " "): this {
        const padding = makePadding(width - this.length, fill);
        if (padding) this.insert(0, padding, {});
        return this;
    }

    /** Centres the line in `width` characters, with unformatted padding (the extra one goes right). */
    center(width: number, fill: string = " "): this {
        const total = width - this.length;
        if (total <= 0) return this;
        this.padStart(this.length + Math.floor(total / 2), fill);
        return this.padEnd(width, fill);
    }

    /**
     * Cuts the line to at most `width` characters, ending it with `ellipsis`
     * (coloured like the text before it, but never part of a link).
     */
    truncate(width: number, ellipsis: string = "…"): this {
        if (this.length <= width) return this;
        const cut = Math.max(0, width - ellipsis.length);
        const state = cut > 0 ? this.getStateAt(cut - 1) : undefined;
        if (state) state.hyperlink = undefined;
        this.remove([cut, this.length]);
        if (cut < width) this.insert(cut, ellipsis.slice(0, width - cut), state ?? {});
        return this;
    }

    /**
     * Word-wraps the line into lines of at most `width` characters, keeping its
     * formatting and links. Breaks at spaces, and inside words longer than a
     * whole line; `\n` always starts a new line. `indent` spaces start every
     * line after the first. The line itself is left as it is.
     */
    wrap(width: number, options: { indent?: number } = {}): AnsiAwareBuffer[] {
        if (width <= 0) return this.splitLines();
        const indent = Math.max(0, Math.min(options.indent ?? 0, width - 1));
        const result: AnsiAwareBuffer[] = [];
        for (const line of this.splitLines()) {
            let start = 0;
            const text = line.text;
            do {
                const room = start > 0 ? width - indent : width;
                let end = text.length;
                let next = end;
                if (text.length - start > room) {
                    const space = text.lastIndexOf(" ", start + room);
                    if (space > start) {
                        end = space;
                        next = space + 1;
                    } else {
                        end = start + Math.max(1, room);
                        next = end;
                    }
                }
                const piece = line.slice(start, end);
                if (start > 0 && indent > 0) piece.padStart(piece.length + indent);
                result.push(piece);
                start = next;
            } while (start < text.length);
        }
        return result;
    }

    /**
     * Converts the buffer to HTML with styling based on format states.
     * Note: Hyperlinks with callbacks cannot be properly rendered in HTML strings.
     * Use toDom() instead if you need clickable links - or pass `linkId`, which
     * names a link (`data-link="<id>"`) so whoever shows the HTML can ask for
     * its click to be run here.
     */
    toHtml(linkId?: (link: FormatHyperlink) => string | null): string {
        let html = "";

        for (const segment of this.segments) {
            const escapedText = this.escapeHtml(segment.text);

            if (!segment.state || isDefaultState(segment.state)) {
                html += escapedText;
                continue;
            }

            const styles: string[] = [];
            const state = segment.state;
            const classAttr = state.cssClass ? ` class="${this.escapeHtml(state.cssClass)}"` : "";

            // Handle inverse first (swaps foreground and background)
            const fg = state.inverse ? state.background : state.foreground;
            const bg = state.inverse ? state.foreground : state.background;

            // Foreground color
            if (fg) {
                styles.push(`color: ${this.colorToHex(fg)}`);
            }

            // Background color
            if (bg) {
                styles.push(`background-color: ${this.colorToHex(bg)}`);
            }

            // Font styles
            if (state.bold) {
                styles.push("font-weight: bold");
            }

            if (state.italic) {
                styles.push("font-style: italic");
            }

            // Text decorations
            const decorations: string[] = [];
            if (state.underline) {
                decorations.push("underline");
            }
            if (state.strikethrough) {
                decorations.push("line-through");
            }
            if (decorations.length > 0) {
                styles.push(`text-decoration: ${decorations.join(" ")}`);
            }

            // Handle hyperlinks
            if (state.hyperlink) {
                styles.push("cursor: pointer");
                styles.push("text-decoration: underline");
                styles.push("text-decoration-style: dotted");
                styles.push("text-decoration-skip-ink: auto");
                const id = linkId?.(state.hyperlink);
                const dataAttr = ' data-output-clickable="true"' + (id ? ` data-link="${this.escapeHtml(id)}"` : '');
                if (state.hyperlink.title) {
                    const titleAttr = ` title="${this.escapeHtml(state.hyperlink.title)}"`;
                    const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
                    html += `<span${styleAttr}${classAttr}${titleAttr}${dataAttr}>${escapedText}</span>`;
                    continue;
                }
                const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
                html += `<span${styleAttr}${classAttr}${dataAttr}>${escapedText}</span>`;
                continue;
            }

            const styleAttr = styles.length > 0 ? ` style="${styles.join("; ")}"` : "";
            html += `<span${styleAttr}${classAttr}>${escapedText}</span>`;
        }

        return html;
    }

    /**
     * Converts the buffer to a DOM DocumentFragment with actual event listeners attached.
     * This should be used instead of toHtml() when you need clickable links.
     */
    toDom(): DocumentFragment {
        const fragment = document.createDocumentFragment();

        for (const segment of this.segments) {
            const state = segment.state;

            if (!state || isDefaultState(state)) {
                fragment.appendChild(document.createTextNode(segment.text));
                continue;
            }

            const element = document.createElement('span');
            element.textContent = segment.text;

            const styles: string[] = [];

            // Handle inverse first (swaps foreground and background)
            const fg = state.inverse ? state.background : state.foreground;
            const bg = state.inverse ? state.foreground : state.background;

            // Foreground color
            if (fg) {
                styles.push(`color: ${this.colorToHex(fg)}`);
            }

            // Background color
            if (bg) {
                styles.push(`background-color: ${this.colorToHex(bg)}`);
            }

            // Font styles
            if (state.bold) {
                styles.push("font-weight: bold");
            }

            if (state.italic) {
                styles.push("font-style: italic");
            }

            // Text decorations
            const decorations: string[] = [];
            if (state.underline) {
                decorations.push("underline");
            }
            if (state.strikethrough) {
                decorations.push("line-through");
            }
            if (decorations.length > 0) {
                styles.push(`text-decoration: ${decorations.join(" ")}`);
            }

            // Handle hyperlinks
            if (state.hyperlink) {
                styles.push("cursor: pointer");
                styles.push("text-decoration: underline");
                styles.push("text-decoration-style: dotted");
                styles.push("text-decoration-skip-ink: auto");

                // Mark as clickable to prevent input focus
                element.dataset.outputClickable = "true";

                if (state.hyperlink.title) {
                    element.title = state.hyperlink.title;
                }

                if (state.hyperlink.onClick) {
                    element.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        state.hyperlink!.onClick!(e);
                    });
                }

                if (state.hyperlink.onContextMenu) {
                    element.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        state.hyperlink!.onContextMenu!(e);
                    });
                }

                if (state.hyperlink.onMouseEnter) {
                    element.addEventListener('mouseenter', (e) => {
                        state.hyperlink!.onMouseEnter!(e);
                    });
                }

                if (state.hyperlink.onMouseLeave) {
                    element.addEventListener('mouseleave', (e) => {
                        state.hyperlink!.onMouseLeave!(e);
                    });
                }
            }

            // Apply dim effect CSS custom properties
            if (state.dim) {
                styles.push(`--dim-start: ${state.dim.startOpacity}`);
                styles.push(`--dim-end: ${state.dim.endOpacity}`);
                styles.push(`--dim-duration: ${state.dim.duration}ms`);
                styles.push(`--dim-easing: ${state.dim.easing || 'ease-in-out'}`);
            }

            if (styles.length > 0) {
                element.style.cssText = styles.join("; ");
            }

            // Apply blink, dim, and custom CSS classes
            const classes: string[] = [];
            if (state.cssClass) {
                classes.push(state.cssClass);
            }
            if (state.slowBlink) {
                classes.push('ansi-slow-blink');
            }
            if (state.rapidBlink) {
                classes.push('ansi-rapid-blink');
            }
            if (state.dim) {
                classes.push('ansi-dim');
            }
            if (classes.length > 0) {
                element.className = classes.join(' ');
            }

            fragment.appendChild(element);
        }

        return fragment;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    private colorToHex(color: FormatColor): string {
        if (color.space === "hex") {
            return color.color;
        }
        if (color.space === "rgb") {
            const r = color.r.toString(16).padStart(2, "0");
            const g = color.g.toString(16).padStart(2, "0");
            const b = color.b.toString(16).padStart(2, "0");
            return `#${r}${g}${b}`;
        }
        if (color.space === "indexed") {
            return colorCodes.xterm[color.index] || "#000000";
        }
        return "#000000";
    }

    private prepareStyle(styleOrIndex: number | StyleInput): FormatStateSnapshot {
        if (typeof styleOrIndex === "number") {
            return {
                foreground: {
                    space: "indexed",
                    index: styleOrIndex,
                },
            };
        }
        return {
            ...toFormatState(styleOrIndex),
        };
    }

    /**
     * Appends segments at the end, normalizing only the seam and the new tail.
     *
     * Normalizing is a left fold (drop empty text, merge a segment into the last kept
     * one when their states are equal), and the existing segments are already
     * normalized, so folding the new segments onto the current tail gives exactly what
     * `normalizeSegments()` over the whole buffer would. That keeps an append O(new
     * segments) instead of O(whole buffer) — merging N lines one append at a time
     * (Client.processLine) is otherwise quadratic.
     *
     * `cloneStates` is false only when the caller owns the incoming segments and their
     * states (e.g. fresh from `getSegments()`), so they can be adopted as they are.
     */
    private appendNormalized(incoming: BufferSegment[], cloneStates: boolean): void {
        let added = 0;
        for (const segment of incoming) {
            if (!segment.text) continue;
            const state = isDefaultState(segment.state)
                ? undefined
                : cloneStates ? cloneState(segment.state) : segment.state;
            const last = this.segments[this.segments.length - 1];
            if (last && statesEqual(last.state, state)) {
                last.text += segment.text;
            } else {
                this.segments.push({text: segment.text, state});
            }
            added += segment.text.length;
        }
        if (added === 0) return;
        this._textCache = null;
        if (this._lengthCache !== null) {
            this._lengthCache += added;
        }
    }

    private createSegmentsFromText(
        text: string,
        explicitState?: FormatStateSnapshot,
        baseState?: FormatStateSnapshot,
    ): BufferSegment[] {
        if (!text) return [];
        if (explicitState) {
            if (text.length === 0) return [];
            return [{text, state: isDefaultState(explicitState) ? undefined : cloneState(explicitState)}];
        }
        if (!text.includes(ESC)) {
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
        this.invalidateCaches();
    }

    private invalidateCaches(): void {
        this._textCache = null;
        this._lengthCache = null;
    }

    private assertRange(start: number, end: number): void {
        if (start < 0 || end < start || end > this.length) {
            throw new RangeError(`Invalid range [${start}, ${end}) for buffer of length ${this.length}`);
        }
    }

    /**
     * Returns the format state at the given character index.
     * This includes color information (foreground, background) and other formatting attributes.
     * Returns undefined if the character at that index has no formatting.
     */
    getStateAt(index: number): FormatStateSnapshot | undefined {
        this.assertIndex(index, false);

        if (this.segments.length === 0) return undefined;

        let currentPos = 0;
        for (const segment of this.segments) {
            const segmentEnd = currentPos + segment.text.length;
            if (index >= currentPos && index < segmentEnd) {
                return cloneState(segment.state);
            }
            currentPos = segmentEnd;
        }

        return undefined;
    }

    /**
     * Applies Mudlet color tags (e.g., <red>, <salmon>, <reset>) to the buffer.
     * Tags are removed from the text and colors are applied from the tag position onwards.
     * <reset> reverts to the formatting that existed at that position (line default).
     *
     * @returns this buffer for chaining
     */
    applyMudletColors(): this {
        const originalText = this.text;
        const tagPattern = /<([a-z_:]+)>/gi;

        // Build Mudlet color map
        const MUDLET_COLORS: Record<string, FormatColor> = {};
        for (const [name, rgb] of Object.entries(mudletColorsJson)) {
            // Handle transparent color with alpha channel (ignore alpha)
            if (Array.isArray(rgb) && rgb.length >= 3) {
                MUDLET_COLORS[name.toLowerCase()] = {
                    space: 'rgb',
                    r: rgb[0],
                    g: rgb[1],
                    b: rgb[2]
                } as RgbColor;
            }
        }

        interface TagInfo {
            index: number;
            tagLength: number;
            tagName: string;
        }

        interface ParsedTag {
            type: 'fg' | 'bg' | 'reset';
            color?: FormatColor;
        }

        const parseMudletTag = (tagName: string): ParsedTag | null => {
            if (tagName === 'reset') {
                return { type: 'reset' };
            }

            // Handle background: <bg:red>
            if (tagName.startsWith('bg:')) {
                const colorName = tagName.substring(3);
                const color = MUDLET_COLORS[colorName.toLowerCase()];
                return color ? { type: 'bg', color } : null;
            }

            // Handle foreground: <red>, <tomato>, etc.
            const color = MUDLET_COLORS[tagName.toLowerCase()];
            return color ? { type: 'fg', color } : null;
        };

        // Find all tags and their positions
        const tags: TagInfo[] = [];
        let match: RegExpExecArray | null;

        tagPattern.lastIndex = 0;
        while ((match = tagPattern.exec(originalText)) !== null) {
            tags.push({
                index: match.index,
                tagLength: match[0].length,
                tagName: match[1].toLowerCase()
            });
        }

        if (tags.length === 0) return this;

        // Remove tags from right to left to maintain indices
        for (let i = tags.length - 1; i >= 0; i--) {
            const tag = tags[i];
            this.remove([tag.index, tag.index + tag.tagLength]);
        }

        // Now apply colors from left to right using adjusted positions. Each tag
        // colours only up to the next tag, so the text after a <reset> already
        // has the formatting it came with and needs nothing done to it.
        let offset = 0;
        for (let i = 0; i < tags.length; i++) {
            const tag = tags[i];
            const adjustedIndex = tag.index - offset;
            offset += tag.tagLength;

            const parsed = parseMudletTag(tag.tagName);
            if (!parsed || parsed.type === 'reset' || adjustedIndex >= this.length) continue;
            const nextIndex = i < tags.length - 1 ? tags[i + 1].index - offset : this.length;
            if (nextIndex > adjustedIndex) {
                // Only the tag's own colour changes; links and other formatting stay.
                this.color(
                    [adjustedIndex, nextIndex],
                    parsed.type === 'fg' ? {foreground: parsed.color} : {background: parsed.color},
                );
            }
        }

        return this;
    }

    /**
     * Creates a clickable link at the specified range by applying hyperlink state with callbacks.
     *
     * @param range - The text range to make clickable [start, end]
     * @param options - Link options including onClick, onContextMenu (right-click), and title
     * @returns this buffer for chaining
     *
     * @example
     * ```typescript
     * const text = "Click here";
     * const start = line.text.indexOf(text);
     * line.createLink([start, start + text.length], {
     *   onClick: () => api.output.print("Clicked!"),
     *   title: "Click to execute"
     * });
     * ```
     */
    createLink(
        range: TextRange,
        options: {
            onClick?: (ev: MouseEvent) => void;
            onContextMenu?: (ev: MouseEvent) => void;
            onMouseEnter?: (ev: MouseEvent) => void;
            onMouseLeave?: (ev: MouseEvent) => void;
            title?: string;
        }
    ): this {
        const [start, end] = range;
        if (start >= end) return this;

        // Per segment, so each keeps its own formatting. A link already on the
        // text (e.g. loot's click under a book's hover/context menu) is merged:
        // the new link's handlers win, the old one's fill in what it leaves out.
        this.mapStates(range, current => {
            const state = current || {};
            const existing = state.hyperlink;
            state.hyperlink = {
                onClick: options.onClick ?? existing?.onClick,
                onContextMenu: options.onContextMenu ?? existing?.onContextMenu,
                onMouseEnter: options.onMouseEnter ?? existing?.onMouseEnter,
                onMouseLeave: options.onMouseLeave ?? existing?.onMouseLeave,
                title: options.title ?? existing?.title,
            };
            return state;
        });

        return this;
    }

    /**
     * Makes a specific word or phrase clickable throughout the buffer.
     *
     * @param text - The text to make clickable
     * @param options - Link options including onClick, onContextMenu (right-click), and title
     * @param searchOptions - Optional search configuration (case insensitive)
     * @returns this buffer for chaining
     *
     * @example
     * ```typescript
     * line.createLinksForText("potion", {
     *   onClick: () => api.output.print("Use potion"),
     *   title: "Click to use"
     * }, { caseInsensitive: true });
     * ```
     */
    createLinksForText(
        text: string,
        options: {
            onClick?: (ev: MouseEvent) => void;
            onContextMenu?: (ev: MouseEvent) => void;
            onMouseEnter?: (ev: MouseEvent) => void;
            onMouseLeave?: (ev: MouseEvent) => void;
            title?: string;
        },
        searchOptions: { caseInsensitive?: boolean } = {}
    ): this {
        if (!text) return this;

        const caseInsensitive = searchOptions.caseInsensitive ?? false;
        const ranges: TextRange[] = [];
        const bufferText = this.text;
        const haystack = caseInsensitive ? bufferText.toLowerCase() : bufferText;
        const needle = caseInsensitive ? text.toLowerCase() : text;

        let searchStart = 0;
        while (searchStart <= bufferText.length - text.length) {
            const index = haystack.indexOf(needle, searchStart);
            if (index === -1) break;
            ranges.push([index, index + text.length]);
            searchStart = index + text.length;
        }

        if (ranges.length === 0) return this;

        // Apply links in reverse order to maintain correct indices
        for (let i = ranges.length - 1; i >= 0; i--) {
            this.createLink(ranges[i], options);
        }

        return this;
    }

    private assertIndex(index: number, allowEnd: boolean): void {
        if (index < 0 || index > this.length || (!allowEnd && index >= this.length)) {
            throw new RangeError(`Index ${index} is out of bounds for buffer of length ${this.length}`);
        }
    }
}

/**
 * Part of a line, chosen with `AnsiAwareBuffer.select` or `selectAll`, to
 * change without counting positions. It follows the line's edits — its own and
 * anyone else's — so changes chain. Colouring only changes what it sets: links,
 * backgrounds and other formatting already on the text stay. An empty
 * selection (nothing found) ignores every change.
 *
 * @example
 * ```typescript
 * api.triggers.register(/^(\w+) (\w+) flakonik/, (line, matches) => {
 *   return line.select(matches, 2)
 *     .fg('gold')
 *     .link({ onClick: () => api.command.send('wypij flakonik'), title: 'Wypij' })
 *     .after(' (leczenie)', { fg: 'gray' })
 *     .line;
 * });
 * ```
 */
export class TextSelection {
    private readonly anchors: { start: number; end: number }[];

    /** @internal Use `AnsiAwareBuffer.select` / `selectAll`. */
    constructor(private readonly buffer: AnsiAwareBuffer, ranges: TextRange[]) {
        this.anchors = ranges.map(range => buffer.anchor(range));
    }

    /** The line this selection is in — handy to return from a trigger at the end of a chain */
    get line(): AnsiAwareBuffer {
        return this.buffer;
    }

    /**
     * Select something else in the same line, to keep a chain going. It searches
     * the whole line, like `line.select` — not just this selection.
     *
     * @example
     * ```typescript
     * api.text('Haslo: abc, czas: 5 min')
     *   .select('abc').fg('gold')
     *   .select(/(\d+) min/, 1).bold();
     * ```
     */
    select(target?: SelectTarget, group?: number | string): TextSelection {
        return this.buffer.select(target, group);
    }

    /** Select every occurrence of something else in the same line (see `line.selectAll`). */
    selectAll(
        target: string | RegExp,
        group?: number | string,
        options: { caseInsensitive?: boolean } = {},
    ): TextSelection {
        return this.buffer.selectAll(target, group, options);
    }

    /** Whether anything was selected */
    get found(): boolean {
        return this.anchors.length > 0;
    }

    /** How many places are selected */
    get count(): number {
        return this.anchors.length;
    }

    /** Where the selected places are now, as `[start, end)` ranges */
    get ranges(): TextRange[] {
        return this.anchors.map(anchor => [anchor.start, anchor.end]);
    }

    /** The text of the first selected place ('' when nothing is selected) */
    get text(): string {
        const first = this.anchors[0];
        return first ? this.buffer.text.slice(first.start, first.end) : "";
    }

    /** The text of every selected place */
    get texts(): string[] {
        const text = this.buffer.text;
        return this.anchors.map(anchor => text.slice(anchor.start, anchor.end));
    }

    /** Set the text colour: `'#ffd700'`, a Mudlet colour name like `'gold'`, or a palette index */
    fg(color: ColorInput): this {
        return this.style({foreground: toFormatColor(color)});
    }

    /** Set the background colour: `'#330000'`, a Mudlet colour name, or a palette index */
    bg(color: ColorInput): this {
        return this.style({background: toFormatColor(color)});
    }

    /** Lay formatting over the selection, keeping whatever it doesn't set */
    style(style: StyleInput): this {
        const state = toFormatState(style);
        return this.forEach(([start, end]) => this.buffer.color([start, end], state));
    }

    /** Make the text bold (`bold(false)` to undo) */
    bold(on: boolean = true): this {
        return this.style({bold: on});
    }

    /** Make the text italic (`italic(false)` to undo) */
    italic(on: boolean = true): this {
        return this.style({italic: on});
    }

    /** Underline the text (`underline(false)` to undo) */
    underline(on: boolean = true): this {
        return this.style({underline: on});
    }

    /** Strike the text through (`strikethrough(false)` to undo) */
    strikethrough(on: boolean = true): this {
        return this.style({strikethrough: on});
    }

    /**
     * Make the text clickable: a click handler, or handlers and a tooltip. A
     * link already on the text is merged — handlers given here win, the old
     * link's fill in the rest.
     */
    link(link: LinkInput): this {
        const options = toHyperlink(link);
        return this.forEach(range => this.buffer.createLink(range, options));
    }

    /** Replace all formatting of the selection, links included; `restyle({})` clears it */
    restyle(style: StyleInput): this {
        return this.forEach(range => this.buffer.restyle(range, style));
    }

    /**
     * Replace the selected text. The new text takes the formatting of the first
     * character it replaces, with `style` (if given) laid over it; the selection
     * then covers the new text.
     * @param text - New text, or a function from the old text to the new
     */
    replace(text: string | ((old: string) => string), style?: StyleInput): this {
        const state = toFormatState(style);
        return this.forEach(([start, end]) => {
            const old = this.buffer.text.slice(start, end);
            const next = typeof text === "function" ? text(old) : text;
            const base = start < end ? this.buffer.getStateAt(start) : undefined;
            this.buffer.replace([start, end], next, base ?? {});
            if (state && next.length > 0) this.buffer.color([start, start + next.length], state);
        });
    }

    /** Remove the selected text */
    remove(): this {
        return this.forEach(range => this.buffer.remove(range));
    }

    /** Insert text in front of the selection — unformatted unless `style` is given */
    before(text: string, style?: StyleInput): this {
        return this.forEach(([start]) => this.buffer.insert(start, text, style ?? {}));
    }

    /** Insert text after the selection — unformatted unless `style` is given */
    after(text: string, style?: StyleInput): this {
        return this.forEach(([, end]) => this.buffer.insert(end, text, style ?? {}));
    }

    /** Runs `fn` on each place in turn, reading its range afresh after the edits before it. */
    private forEach(fn: (range: TextRange) => void): this {
        for (const anchor of this.anchors) fn([anchor.start, anchor.end]);
        return this;
    }
}

export {cloneState as cloneFormatState, statesEqual as formatStatesEqual};
