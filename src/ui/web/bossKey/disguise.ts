import { APP_NAME, APP_TITLE } from "./chrome";

/**
 * The parts of the disguise that live outside the overlay's own DOM: the tab
 * title, the favicon, and sound.
 *
 * All of them are per-activation. The tab is the one part of the client an
 * overlay cannot cover, so it has to be disguised too -- but only while the
 * overlay is actually up. Claiming the title for the whole session would mean
 * the game's own title features (`HpTitle`'s "[5/7]", `FightTitle`'s combat
 * sword) never show at all, which is too high a price to pay outside a panic.
 *
 * Muting is the same: wanted only while the window is covered, and the player's
 * own mute setting has to survive it.
 */

/** Minimal view of `Client.SoundManager` --- structural so tests can fake it. */
export interface SoundControl {
    readonly isMuted: boolean;
    mute(): void;
    unmute(): void;
}

/** Blue tile with a white W. Reads as Word in a tab strip at a glance. */
const WORD_FAVICON =
    "data:image/svg+xml," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
            '<rect width="32" height="32" rx="4" fill="#2b579a"/>' +
            '<text x="16" y="24" font-family="Segoe UI,Arial,sans-serif" font-size="21"' +
            ' font-weight="700" fill="#ffffff" text-anchor="middle">W</text>' +
            "</svg>",
    );

/** The title the tab carries while the overlay is up. */
export const DISGUISED_TITLE = `${APP_TITLE} - ${APP_NAME}`;

const iconLinks = (): HTMLLinkElement[] =>
    Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]'));

/**
 * Make the browser tab claim to be a Word document.
 *
 * `suppressTitle` is injected rather than imported so this stays usable from any
 * UI: the stock UI passes `suppressTitleUpdates` from `FightTitle` (which also
 * covers `HpTitle`, since that only reaches the title through `setBaseTitle`),
 * and a UI that never writes the title passes nothing.
 *
 * Returns a teardown that puts everything back, for unmount and for tests.
 */
export function installTitleDisguise(suppressTitle?: (suppressed: boolean) => void): () => void {
    // Freeze the game's own title writes BEFORE taking ours, otherwise the next
    // char.state repaints "Arkadia [5/7]" over the document name.
    suppressTitle?.(true);

    const savedTitle = document.title;
    const savedIcons = iconLinks().map((link) => ({ link, href: link.getAttribute("href") ?? "" }));

    document.title = DISGUISED_TITLE;
    savedIcons.forEach(({ link }) => link.setAttribute("href", WORD_FAVICON));

    return () => {
        savedIcons.forEach(({ link, href }) => link.setAttribute("href", href));
        document.title = savedTitle;
        // Release last, so the re-applied game title lands on top of ours.
        suppressTitle?.(false);
    };
}

/** Whether this module was the one that muted, so it knows to undo it. */
let mutedByUs = false;

/**
 * Silence the client while the overlay is up. A trigger beep from behind a Word
 * window gives the whole thing away. Only mutes if the player had not already --
 * then {@link unmuteAfterOverlay} knows it is safe to undo.
 */
export function muteForOverlay(soundControl?: SoundControl | null): void {
    if (!soundControl || mutedByUs || soundControl.isMuted) return;
    mutedByUs = true;
    soundControl.mute();
}

/** Restore sound, but only if we were the ones who took it away. */
export function unmuteAfterOverlay(soundControl?: SoundControl | null): void {
    if (!mutedByUs) return;
    mutedByUs = false;
    soundControl?.unmute();
}

/** Test seam: forget the mute bookkeeping without touching the document. */
export function resetDisguiseForTests(): void {
    mutedByUs = false;
}
