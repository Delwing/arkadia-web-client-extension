import { globalStorage } from "@modules/core/storage";
import { pushBackLayer } from "@web-ui/backNavigation.ts";

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
 * unfolds the rails - and the location-bind row above them - into full, wrapped
 * panels when the player wants to see everything at once.
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

/**
 * How the footer folds: `toggle` (the default - it rests folded and the player
 * unfolds it), or pinned open / pinned shut, which also takes the expander away
 * since there would be nothing for it to do.
 */
export type MobileFooterExpand = 'toggle' | 'expanded' | 'collapsed';

/** The configured folding mode, defaulting to the togglable dock. */
export function getFooterExpandMode(): MobileFooterExpand {
    const mode = (globalStorage.get('uiSettings') as { mobileFooterExpand?: string } | null)?.mobileFooterExpand;
    return mode === 'expanded' || mode === 'collapsed' ? mode : 'toggle';
}

const EXPAND_TITLE = 'Rozwin stopke';
const COLLAPSE_TITLE = 'Zwin stopke';

/**
 * Wires the footer expander. Returns a teardown function.
 *
 * In `toggle` mode the expansion is deliberately not persisted: the folded dock
 * is the resting state, and an expanded footer left over from a previous session
 * would eat half the screen on the next connect. Someone who wants it open every
 * time says so with the setting instead, which is also the only thing that
 * survives a reload.
 *
 * Unfolded by the expander, the footer is one more thing Back folds away.
 */
export function setupMobileFooter(): () => void {
    const button = document.getElementById('footer-expand');
    if (!document.getElementById('char-state') || !button) return () => {};

    // The flag rides on <body>, not on the footer: the location-bind row unfolds
    // with it and is the footer's sibling, which no CSS selector can reach from
    // inside it.
    let releaseBack: (() => void) | null = null;
    const setExpanded = (expanded: boolean) => {
        document.body.dataset.footerExpanded = expanded ? '1' : '0';
        button.setAttribute('title', expanded ? COLLAPSE_TITLE : EXPAND_TITLE);
        // Only the player's own unfolding: a footer pinned open is not a layer.
        const layered = expanded && getFooterExpandMode() === 'toggle';
        if (layered && !releaseBack) {
            releaseBack = pushBackLayer(() => setExpanded(false));
        } else if (!layered && releaseBack) {
            releaseBack();
            releaseBack = null;
        }
    };

    // A pinned mode owns the flag outright, so a leftover expansion cannot
    // survive the player pinning the footer shut.
    const applyMode = () => {
        const mode = getFooterExpandMode();
        if (mode !== 'toggle') setExpanded(mode === 'expanded');
        return mode;
    };

    setExpanded(getFooterExpandMode() === 'expanded');

    const onClick = () => {
        // The expander is hidden outside `toggle` mode; ignoring the click keeps
        // that true even if something else reaches the button.
        if (getFooterExpandMode() !== 'toggle') return;
        setExpanded(document.body.dataset.footerExpanded !== '1');
    };
    button.addEventListener('click', onClick);

    const unsubscribeSettings = globalStorage.onChange('uiSettings', () => { applyMode(); });

    // Rotating a phone into landscape (or resizing a desktop window past the
    // breakpoint) leaves a stale expanded flag behind, which the desktop CSS
    // ignores but which would come back on the next rotation.
    const media = typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_FOOTER_QUERY) : null;
    const onMediaChange = () => {
        if (!media?.matches && getFooterExpandMode() === 'toggle') setExpanded(false);
    };
    media?.addEventListener('change', onMediaChange);

    return () => {
        button.removeEventListener('click', onClick);
        media?.removeEventListener('change', onMediaChange);
        unsubscribeSettings();
        releaseBack?.();
        releaseBack = null;
    };
}
