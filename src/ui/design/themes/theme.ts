/**
 * Theme runtime for the design system.
 *
 * Built-in themes are pure CSS — a `data-ark-theme` attribute selects one of the
 * blocks in `scales.generated.css`, and that is the whole mechanism. This module
 * exists for the two things CSS cannot do on its own:
 *
 *   1. applying a theme to a root element from settings, and
 *   2. the player's own colour, which has no pre-generated block and so needs a
 *      twelve-step scale built at runtime from a single seed.
 *
 * The generated scale follows the same step roles as the Radix scales (see
 * css/tokens.css), which is what lets a custom theme drive every component
 * without any component knowing it is custom.
 */

export const CUSTOM_THEME_ID = "custom";

/** Keep in step with `themes.config.mjs`; the unit test asserts they match. */
export const BUILT_IN_THEMES = [
    "arkadia",
    "dark-neutral",
    "fantasy",
    "forest",
    "icy",
    "gray",
    "parchment",
    "silver",
] as const;

export type BuiltInTheme = (typeof BUILT_IN_THEMES)[number];

/**
 * Player-facing names and appearance, for the theme picker.
 *
 * Duplicated from `themes.config.mjs` because that file is the Node generator's
 * input and is not part of the TypeScript program; the unit test asserts the two
 * never drift apart.
 */
export const THEME_CATALOG: { id: BuiltInTheme; label: string; appearance: "dark" | "light" }[] = [
    { id: "arkadia", label: "Arkadia (ciemny)", appearance: "dark" },
    { id: "dark-neutral", label: "Neutralny ciemny", appearance: "dark" },
    { id: "fantasy", label: "Fantasy", appearance: "dark" },
    { id: "forest", label: "Las", appearance: "dark" },
    { id: "icy", label: "Lodowy", appearance: "dark" },
    { id: "gray", label: "Szary", appearance: "dark" },
    { id: "parchment", label: "Pergamin (jasny)", appearance: "light" },
    { id: "silver", label: "Srebrny (jasny)", appearance: "light" },
];
export type ThemeId = BuiltInTheme | typeof CUSTOM_THEME_ID;

export const DEFAULT_THEME: BuiltInTheme = "arkadia";

const CUSTOM_STYLE_ID = "ark-custom-theme";

export function isBuiltInTheme(value: string): value is BuiltInTheme {
    return (BUILT_IN_THEMES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* colour maths                                                               */
/* -------------------------------------------------------------------------- */

interface Hsl {
    h: number;
    s: number;
    l: number;
}

export function hexToHsl(hex: string): Hsl {
    const normalized = hex.replace("#", "");
    const full =
        normalized.length === 3
            ? normalized
                  .split("")
                  .map((c) => c + c)
                  .join("")
            : normalized;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const l = (max + min) / 2;
    if (delta === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
    const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / delta + 6) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
    const sat = s / 100;
    const lig = l / 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to255 = (x: number) =>
        Math.round(Math.max(0, Math.min(1, x)) * 255)
            .toString(16)
            .padStart(2, "0");
    return `#${to255(f(0))}${to255(f(8))}${to255(f(4))}`;
}

/**
 * Lightness ladders per step, mirroring how the Radix dark and light scales
 * move: near-flat at the background end, a jump at the solid (step 9), then
 * a long reach to the text steps.
 */
const DARK_LIGHTNESS = [7, 10, 13, 16, 19, 23, 28, 37, 45, 52, 72, 93];
const LIGHT_LIGHTNESS = [99, 97, 94, 91, 88, 84, 78, 68, 55, 48, 39, 17];

/** Neutrals keep a trace of the seed hue so a theme reads as one family. */
const NEUTRAL_SATURATION = [4, 4, 5, 5, 6, 6, 7, 8, 8, 8, 6, 5];

function buildScale(hue: number, saturation: number, appearance: "dark" | "light", neutral: boolean): string[] {
    const ladder = appearance === "dark" ? DARK_LIGHTNESS : LIGHT_LIGHTNESS;
    return ladder.map((lightness, index) => {
        const stepSaturation = neutral
            ? Math.min(saturation, NEUTRAL_SATURATION[index])
            : // Accent steps hold their chroma; the very light/dark ends lose a
              // little so they do not turn into neon at step 12.
              Math.max(12, Math.round(saturation * (index >= 10 ? 0.75 : 1)));
        return hslToHex(hue, stepSaturation, lightness);
    });
}

/** Perceived luminance of a hex colour, 0–1. Used to pick contrast text. */
export function luminance(hex: string): number {
    const normalized = hex.replace("#", "");
    const r = parseInt(normalized.slice(0, 2), 16) / 255;
    const g = parseInt(normalized.slice(2, 4), 16) / 255;
    const b = parseInt(normalized.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Builds the CSS for a player-chosen accent colour: the same custom properties
 * a generated theme block declares, so nothing downstream can tell the
 * difference.
 */
export function buildCustomThemeCss(seed: string, appearance: "dark" | "light" = "dark"): string {
    const { h, s } = hexToHsl(seed);
    const accentSaturation = Math.max(30, Math.min(90, s));
    const accent = buildScale(h, accentSaturation, appearance, false);
    const gray = buildScale(h, accentSaturation, appearance, true);

    const lines: string[] = [];
    lines.push(`[data-ark-theme="${CUSTOM_THEME_ID}"] {`);
    lines.push(`  color-scheme: ${appearance};`);
    lines.push(`  --ark-appearance: ${appearance};`);
    gray.forEach((value, index) => lines.push(`  --ark-gray-${index + 1}: ${value};`));
    accent.forEach((value, index) => lines.push(`  --ark-accent-${index + 1}: ${value};`));

    // Alpha steps: the solid accent at rising opacities. Good enough for the
    // films (highlights, tints) that are the only places alphas are used.
    const alphas = [0.03, 0.06, 0.09, 0.12, 0.16, 0.2, 0.26, 0.32, 0.4, 0.5, 0.7, 0.92];
    alphas.forEach((alpha, index) => {
        lines.push(`  --ark-accent-a${index + 1}: ${hexToRgba(accent[8], alpha)};`);
        lines.push(`  --ark-gray-a${index + 1}: ${hexToRgba(gray[11], alpha)};`);
    });

    lines.push(`  --ark-accent-contrast: ${luminance(accent[8]) > 0.55 ? "#111" : "#fff"};`);
    lines.push("}");
    return lines.join("\n");
}

export function hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace("#", "");
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* -------------------------------------------------------------------------- */
/* applying                                                                   */
/* -------------------------------------------------------------------------- */

export interface ThemeSelection {
    theme: ThemeId;
    /** Seed colour, required when `theme` is `custom`. */
    customColor?: string;
    appearance?: "dark" | "light";
}

/**
 * Points an element at a theme. The custom theme's stylesheet is (re)written
 * into a single `<style>` element in the document head; built-in themes need no
 * JavaScript at all beyond setting the attribute.
 */
export function applyTheme(element: HTMLElement, selection: ThemeSelection): void {
    const { theme, customColor, appearance = "dark" } = selection;

    if (theme === CUSTOM_THEME_ID) {
        if (!customColor) {
            element.setAttribute("data-ark-theme", DEFAULT_THEME);
            return;
        }
        installCustomTheme(element.ownerDocument ?? document, buildCustomThemeCss(customColor, appearance));
    }

    element.setAttribute("data-ark-theme", theme);
}

function installCustomTheme(doc: Document, css: string): void {
    let style = doc.getElementById(CUSTOM_STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
        style = doc.createElement("style");
        style.id = CUSTOM_STYLE_ID;
        doc.head.appendChild(style);
    }
    style.textContent = css;
}

export function removeCustomTheme(doc: Document = document): void {
    doc.getElementById(CUSTOM_STYLE_ID)?.remove();
}

/** A random seed colour, for "surprise me" in the appearance settings. */
export function randomThemeColor(): string {
    const h = Math.floor(Math.random() * 360);
    const s = 40 + Math.floor(Math.random() * 40);
    return hslToHex(h, s, 60);
}
