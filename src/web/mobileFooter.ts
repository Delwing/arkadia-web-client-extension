import { globalStorage } from "@modules/core/storage";

/**
 * The phone footer: one predictable-height dock instead of a block that grows
 * and shrinks under the game output.
 *
 * The stock footer is a single wrapping flex row of everything at once - the
 * character stats, then every chip the player left switched on, then whatever a
 * plugin registered. On a desktop that row is wide enough to be one line. On a
 * phone it is not: the stats alone wrap onto two lines, and because both the
 * chips ("Walka", "Paczka", "Zaslona" ...) and the number of stat bars appear
 * and disappear with what is happening in the game, the footer changed height
 * several times a minute - pushing the output up and down mid-fight.
 *
 * The mobile layout (see footerMobile.css, same breakpoint as
 * MOBILE_FOOTER_QUERY) splits that row into two fixed-height rails - stats on
 * top, chips below - each scrolling sideways instead of wrapping. Nothing is
 * hidden and nothing is reordered; the footer simply stops resizing itself.
 * This module owns the one piece of that which is not CSS: the expander that
 * unfolds both rails into a full, wrapped panel when the player wants to see
 * everything at once.
 */

/**
 * When the stock footer switches to its phone layout: a narrow screen, or a
 * short touch screen - a phone held in landscape is wide enough for the desktop
 * rules and has even less height to give the footer than in portrait.
 *
 * Duplicated verbatim by the `@media` block in footerMobile.css; the two have to
 * agree, or the compact stat meters and the rails they sit in would part ways.
 */
export const MOBILE_FOOTER_QUERY = '(max-width: 768px), (max-height: 520px) and (pointer: coarse)';

/** Is the compact phone footer switched on? (Default yes; `false` opts out.) */
export function isCompactFooterEnabled(): boolean {
    const settings = globalStorage.get('uiSettings') as { mobileFooterCompact?: boolean } | null;
    return settings?.mobileFooterCompact !== false;
}

const EXPAND_TITLE = 'Rozwin stopke';
const COLLAPSE_TITLE = 'Zwin stopke';

/**
 * Wires the footer expander. Returns a teardown function.
 *
 * Expansion is deliberately not persisted: the collapsed dock is the resting
 * state, and an expanded footer left over from a previous session would eat
 * half the screen on the next connect.
 */
export function setupMobileFooter(): () => void {
    const charState = document.getElementById('char-state');
    const button = document.getElementById('footer-expand');
    if (!charState || !button) return () => {};

    const setExpanded = (expanded: boolean) => {
        charState.dataset.footerExpanded = expanded ? '1' : '0';
        button.setAttribute('title', expanded ? COLLAPSE_TITLE : EXPAND_TITLE);
    };

    setExpanded(false);

    const onClick = () => setExpanded(charState.dataset.footerExpanded !== '1');
    button.addEventListener('click', onClick);

    // Rotating a phone into landscape (or resizing a desktop window past the
    // breakpoint) leaves the desktop footer with a stale expanded flag, which
    // the desktop CSS ignores but which would come back on the next rotation.
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_FOOTER_QUERY) : null;
    const onMediaChange = () => {
        if (!media?.matches) setExpanded(false);
    };
    media?.addEventListener('change', onMediaChange);

    return () => {
        button.removeEventListener('click', onClick);
        media?.removeEventListener('change', onMediaChange);
    };
}
