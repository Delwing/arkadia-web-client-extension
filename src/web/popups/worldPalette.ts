/**
 * Shared colours for the world & time popups (Zegar, Kalendarz, Czas, Slonce).
 *
 * Three popups used to carry their own copy of the season table, and every copy
 * spelled the same four hues differently. They are one table now, on the design
 * system's categorical data palette (`--ark-data-1..6`, see DESIGN_SYSTEM.md
 * §3): seasons and the sun/moon axis only ever need to be told APART, so they
 * are data, not status.
 *
 * Slot assignment, and the one deliberate overlap:
 *
 *   data-1  indigo  the moon — nightfall, sunset, the night half of the sky
 *   data-2  cyan    Zima
 *   data-3  jade    Wiosna
 *   data-4  bronze  the sun — sunrise, the day half of the sky — AND Lato
 *   data-5  plum    Jesien
 *
 * Lato shares bronze with the sun on purpose. The palette has exactly one warm
 * hue (`amber` and `tomato` are reserved for status), and summer is the sun's
 * own season, so where the two meet — the month header in the calendar — the
 * repeat reads as agreement rather than as a collision. It is the only slot
 * reused across the two sets; everything adjacent to it stays distinct.
 *
 * The moon PHASE glyphs deliberately stay off the data palette. A full moon is
 * bright and a new moon is not, which is a contrast difference rather than a
 * hue difference, so they take the text roles and keep working in the two light
 * themes where a sixth hue would have had to fight the parchment.
 */

/** Season index (0..3 = Wiosna, Lato, Jesien, Zima) to its data slot. */
export const SEASON_COLORS = [
    'var(--ark-data-3-text)', // wiosna (spring)
    'var(--ark-data-4-text)', // lato (summer)
    'var(--ark-data-5-text)', // jesien (autumn)
    'var(--ark-data-2-text)', // zima (winter)
];

export const SEASON_NAMES = ['Wiosna', 'Lato', 'Jesien', 'Zima'];

/** Sunrise, daylight, the sun glyph. */
export const SUN_COLOR = 'var(--ark-data-4-text)';

/** Sunset, night, the moon glyph. */
export const MOON_COLOR = 'var(--ark-data-1-text)';

/** A full moon reads as bright, a new one as absent — contrast, not hue. */
export const FULL_MOON_COLOR = 'var(--ark-text)';
export const NEW_MOON_COLOR = 'var(--ark-text-secondary)';
