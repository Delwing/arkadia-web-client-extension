import {colorCodes} from "@modules/core/Colors.ts";
import mudletColorsJson from "@client/colors.json";

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

export function cloneColor(color?: FormatColor): FormatColor | undefined {
    if (!color) return undefined;
    if (color.space === "indexed") {
        return {space: "indexed", index: color.index};
    }
    if (color.space === "hex") {
        return {space: "hex", color: color.color};
    }
    return {space: "rgb", r: color.r, g: color.g, b: color.b};
}

export function colorsEqual(a?: FormatColor, b?: FormatColor): boolean {
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

/** A colour as the `#rrggbb` CSS takes (indexed colours from the xterm palette). */
export function colorToHex(color: FormatColor): string {
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

/** The Mudlet colour names (`cecho` tags like `<gold>`), lower-cased, as RGB colours. */
export function mudletColorMap(): Record<string, FormatColor> {
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
    return MUDLET_COLORS;
}
