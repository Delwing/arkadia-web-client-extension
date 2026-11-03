import mudletColorsJson from "@client/colors.json";
import type {FormatColor, FormatHyperlink, FormatStateSnapshot, TextRange} from "./FormatState";

/**
 * A colour, written the short way: `'#ffd700'` / `'#fd0'`, a Mudlet colour name
 * (`'gold'`, `'light_gray'` — the names `cecho` knows), an xterm palette index
 * (0-255), or a full colour object.
 */
export type ColorInput = string | number | FormatColor;

/** What a link does: a click handler, or the full set of handlers and a tooltip. */
export type LinkInput = ((ev: MouseEvent) => void) | FormatHyperlink;

/**
 * Formatting written the short way. Anything that takes a style accepts it, as
 * well as a full `FormatStateSnapshot`.
 *
 * @example
 * ```typescript
 * buffer.append("Haslo: ", { fg: 'gray' });
 * buffer.append(setName, { fg: '#ffa500', bold: true, link: () => api.command.send(`kup ${setName}`) });
 * ```
 */
export interface StyleSpec {
    fg?: ColorInput;
    bg?: ColorInput;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    /** Makes the text clickable */
    link?: LinkInput;
    /** A CSS class for the text */
    cssClass?: string;
}

/** A style: the short form or a full `FormatStateSnapshot`. */
export type StyleInput = StyleSpec | FormatStateSnapshot;

let mudletColors: Map<string, FormatColor> | undefined;

function mudletColor(name: string): FormatColor | undefined {
    if (!mudletColors) {
        mudletColors = new Map();
        for (const [key, rgb] of Object.entries(mudletColorsJson)) {
            if (Array.isArray(rgb) && rgb.length >= 3) {
                mudletColors.set(key.toLowerCase(), {space: "rgb", r: rgb[0], g: rgb[1], b: rgb[2]});
            }
        }
    }
    const color = mudletColors.get(name.toLowerCase());
    return color && {...color};
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Turns any colour input into a colour object; throws on a name or string it doesn't know. */
export function toFormatColor(input: ColorInput): FormatColor {
    if (typeof input === "number") {
        if (!Number.isInteger(input) || input < 0 || input > 255) {
            throw new RangeError(`Palette colour must be 0-255, got ${input}`);
        }
        return {space: "indexed", index: input};
    }
    if (typeof input === "string") {
        if (HEX.test(input)) return {space: "hex", color: input};
        const named = mudletColor(input);
        if (named) return named;
        throw new RangeError(`Unknown colour "${input}" — use '#rrggbb' or a Mudlet colour name such as 'gold'`);
    }
    return {...input} as FormatColor;
}

/** Turns a link input into a hyperlink. */
export function toHyperlink(input: LinkInput): FormatHyperlink {
    return typeof input === "function" ? {onClick: input} : {...input};
}

const SPEC_KEYS = ["fg", "bg", "link"] as const;

function isSpec(style: StyleInput): style is StyleSpec {
    return SPEC_KEYS.some(key => key in style);
}

/**
 * Turns a style into a `FormatStateSnapshot`. A snapshot comes back as it is,
 * so the existing state-taking methods pay nothing for accepting both forms.
 */
export function toFormatState(style: StyleInput): FormatStateSnapshot;
export function toFormatState(style: StyleInput | undefined): FormatStateSnapshot | undefined;
export function toFormatState(style: StyleInput | undefined): FormatStateSnapshot | undefined {
    if (!style || !isSpec(style)) return style as FormatStateSnapshot | undefined;
    const {fg, bg, link, ...rest} = style;
    const state: FormatStateSnapshot = {...rest};
    if (fg !== undefined) state.foreground = toFormatColor(fg);
    if (bg !== undefined) state.background = toFormatColor(bg);
    if (link !== undefined) state.hyperlink = toHyperlink(link);
    return state;
}

/**
 * Where each trigger match came from, so `select(matches, group)` can find a
 * capture group's exact position without the regex needing the `d` flag. Weak,
 * so a match nobody selects from costs nothing once it is dropped.
 */
/** A match's capture group positions (the `d` flag's `indices`, ES2022). */
type MatchIndices = Array<[number, number] | undefined> & { groups?: Record<string, [number, number] | undefined> };
type WithIndices = { indices?: MatchIndices };

const matchSources = new WeakMap<RegExpMatchArray, RegExp>();

/** @internal Records the regex a trigger match came from. */
export function noteMatchSource(matches: RegExpMatchArray, pattern: RegExp): void {
    matchSources.set(matches, pattern);
}

/**
 * Where capture group `group` (index or name) of `matches` sits in the text the
 * match was made against, or undefined when the group didn't take part or the
 * match has no position. Positions come from the match's own `indices` (`d`
 * flag), else from re-running its regex at the same place, else — for a match
 * built by hand — from finding the group's text inside the whole match.
 * `input` is the text to search when the match carries neither position nor
 * input, as a global regex's `String.match` result does.
 */
export function matchGroupRange(
    matches: RegExpMatchArray,
    group: number | string = 0,
    input?: string,
): TextRange | undefined {
    const whole = matches[0];
    if (typeof whole !== "string") return undefined;
    const text = typeof group === "number" ? matches[group] : matches.groups?.[group];
    if (typeof text !== "string") return undefined;

    let index = matches.index;
    if (index === undefined) {
        // A global regex's String.match: no positions, take the first occurrence.
        const source = matches.input ?? input;
        if (typeof source !== "string") return undefined;
        index = source.indexOf(whole);
        if (index === -1) return undefined;
    }
    if (group === 0) return [index, index + whole.length];

    const indices = (matches as WithIndices).indices ?? (reexec(matches, index) as WithIndices | null)?.indices;
    if (indices) {
        const range = typeof group === "number" ? indices[group] : indices.groups?.[group];
        return range ? [range[0], range[1]] : undefined;
    }
    const offset = whole.indexOf(text);
    if (offset === -1) return undefined;
    return [index + offset, index + offset + text.length];
}

function reexec(matches: RegExpMatchArray, index: number): RegExpExecArray | null {
    const pattern = matchSources.get(matches);
    if (!pattern || typeof matches.input !== "string") return null;
    const flags = pattern.flags.replace(/[gy]/g, "") + (pattern.flags.includes("d") ? "y" : "dy");
    const sticky = new RegExp(pattern.source, flags);
    sticky.lastIndex = index;
    const result = sticky.exec(matches.input);
    return result && result[0] === matches[0] ? result : null;
}
