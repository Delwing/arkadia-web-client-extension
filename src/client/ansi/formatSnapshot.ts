import {cloneColor, colorsEqual} from "./colors";
import type {FormatColor} from "./colors";

/** Hyperlink with callbacks */
export interface FormatHyperlink {
    onClick?: (ev: MouseEvent) => void;
    onContextMenu?: (ev: MouseEvent) => void;  // right click
    onMouseEnter?: (ev: MouseEvent) => void;
    onMouseLeave?: (ev: MouseEvent) => void;
    title?: string;
}

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

/** Buffer segment with text and optional formatting state */
export interface BufferSegment {
    text: string;
    state?: FormatStateSnapshot;
}

export function hyperlinksEqual(a?: FormatHyperlink, b?: FormatHyperlink): boolean {
    // Since hyperlinks now carry callbacks (functions), we can't meaningfully compare them by value.
    // We consider hyperlinks equal only if both are undefined.
    // This ensures each hyperlink segment remains separate.
    return !a && !b;

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

export function isDefaultState(state?: FormatStateSnapshot): boolean {
    return !hasVisualFormatting(state) && (!state || !state.hyperlink);
}

export function cloneState(state?: FormatStateSnapshot): FormatStateSnapshot | undefined {
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
export function overlayState(base: FormatStateSnapshot | undefined, style: FormatStateSnapshot): FormatStateSnapshot {
    const result: FormatStateSnapshot = cloneState(base) ?? {};
    const patch = cloneState(style)!;
    for (const key of Object.keys(patch) as (keyof FormatStateSnapshot)[]) {
        if (patch[key] !== undefined) {
            (result as Record<string, unknown>)[key] = patch[key];
        }
    }
    return result;
}

export function statesEqual(a?: FormatStateSnapshot, b?: FormatStateSnapshot): boolean {
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
