import {toFormatColor, toFormatState, toHyperlink} from "./style";
import type {ColorInput, LinkInput, StyleInput} from "./style";
import type {TextRange} from "./formatSnapshot";
import type {AnsiAwareBuffer} from "./AnsiAwareBuffer";

/** What `AnsiAwareBuffer.select` can select: trigger matches, text, a regex or a range */
export type SelectTarget = RegExpMatchArray | string | RegExp | TextRange;

export function isTextRange(target: SelectTarget): target is TextRange {
    return Array.isArray(target) && target.length === 2 && typeof target[0] === "number";
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
