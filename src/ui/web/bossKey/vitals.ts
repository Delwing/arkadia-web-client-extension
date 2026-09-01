/**
 * Maps live vitals onto Word status-bar readouts.
 *
 * The overlay has to keep the player alive without showing anything that reads
 * as a game. Word's status bar already carries numbers in exactly the right
 * shape, so the vitals hide inside them:
 *
 * - HP is the page number. GMCP `hp` is 0..6 and the stock UI displays it as
 *   `hp + 1` out of 7 (see `HpTitle.ts` and the CharState config), so "Strona 5
 *   z 7" is literally the HP bar with a Polish word in front of it -- and a
 *   seven-page report is an entirely ordinary document.
 * - Fatigue is the zoom level. `fatigue` is 0..9 and rises as you tire, so it
 *   maps to zoom running down from 100% (rested, and the value Word actually
 *   defaults to) toward 10% (spent).
 *
 * Both are pure functions so the mapping can be tested without a browser.
 */

/** Total pages shown in the status bar --- the HP scale, `hp + 1` out of 7. */
export const HP_PAGES = 7;

/** GMCP `fatigue` runs 0 (rested) to 9 (spent). */
const FATIGUE_MAX = 9;

/** Zoom shown when rested; Word's own default, so it looks untouched. */
const ZOOM_RESTED = 100;

/** Zoom shown at maximum fatigue. Word's slider bottoms out at 10%. */
const ZOOM_SPENT = 10;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

/**
 * HP as a Word page number: 1..7.
 *
 * Falls back to a full 7 before any `gmcp.char.state` arrives, so a freshly
 * opened overlay shows a plausible "last page" rather than a suspicious 1.
 */
export function hpToPage(hp: number | undefined): number {
    if (typeof hp !== "number" || Number.isNaN(hp)) return HP_PAGES;
    return clamp(Math.round(hp) + 1, 1, HP_PAGES);
}

/** Fatigue as a Word zoom percentage: 100% rested down to 10% spent. */
export function fatigueToZoom(fatigue: number | undefined): number {
    if (typeof fatigue !== "number" || Number.isNaN(fatigue)) return ZOOM_RESTED;
    const level = clamp(Math.round(fatigue), 0, FATIGUE_MAX);
    const span = ZOOM_RESTED - ZOOM_SPENT;
    return Math.round(ZOOM_RESTED - (level / FATIGUE_MAX) * span);
}

/** One series in the vitals bar chart. */
export interface VitalBar {
    key: string;
    /** Series label. Deliberately the stock UI's terse codes -- see below. */
    label: string;
    max: number;
}

/**
 * The vitals the chart plots, always, in this order.
 *
 * Deliberately only the four sustain stats -- fatigue, hunger, thirst and
 * encumbrance. They are the ones worth watching while the client is hidden and
 * you are not fighting; HP already has the status-bar page number, and plotting
 * all eleven made a dense little chart nobody could read at a glance.
 *
 * Labels are the short codes the stock UI already uses (`BarOrderSettings`),
 * not the full Polish names: "ZM / GLO / PRA / OBC" reads as a row of column
 * codes in a report, whereas "Glod" and "Pragnienie" would not survive a second
 * glance. Maxima match the stock CharState config.
 */
export const VITAL_BARS: VitalBar[] = [
    { key: "fatigue", label: "ZM", max: 9 },
    { key: "stuffed", label: "GLO", max: 3 },
    { key: "soaked", label: "PRA", max: 3 },
    { key: "encumbrance", label: "OBC", max: 6 },
];

/** One plotted bar: the value, its maximum, and the height fraction to draw. */
export interface PlottedBar extends VitalBar {
    value: number;
    ratio: number;
}

/**
 * Turn a `gmcp.char.state` snapshot into chart bars.
 *
 * Every configured series is plotted every time, so the chart keeps a stable
 * shape -- a figure whose bars appear and disappear as the game reports things
 * draws the eye, which is the opposite of what this is for. A vital the game
 * has not reported yet simply plots at zero until its first update, which for a
 * connected character is immediate.
 */
export function plotVitals(state: Record<string, number | undefined>): PlottedBar[] {
    return VITAL_BARS.map((bar) => {
        const raw = state[bar.key];
        const value = typeof raw === "number" && !Number.isNaN(raw) ? clamp(Math.round(raw), 0, bar.max) : 0;
        return { ...bar, value, ratio: bar.max === 0 ? 0 : value / bar.max };
    });
}

/**
 * Where the zoom slider's knob sits, 0..1, for the given zoom percentage.
 *
 * Word's slider is centred on 100% with 10..100 on the left half and 100..500
 * on the right, so a rested character parks the knob dead centre exactly like
 * an untouched document.
 */
export function zoomToSliderPosition(zoom: number): number {
    const clamped = clamp(zoom, ZOOM_SPENT, 500);
    if (clamped <= ZOOM_RESTED) {
        return ((clamped - ZOOM_SPENT) / (ZOOM_RESTED - ZOOM_SPENT)) * 0.5;
    }
    return 0.5 + ((clamped - ZOOM_RESTED) / (500 - ZOOM_RESTED)) * 0.5;
}
