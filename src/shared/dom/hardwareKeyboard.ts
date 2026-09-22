/**
 * "Is a real keyboard attached?" - an inference, never a fact. No browser will
 * answer this question, so this watches for the traces a physical keyboard
 * leaves and nothing else can.
 *
 * It exists because the location-bind row advertises its shortcuts ("[ALT+1]
 * zerknij"). On a phone that hint is noise: there is no Alt key to press, and it
 * takes up the width the action text needs. But a tablet with a keyboard case,
 * or a phone with a Bluetooth keyboard, is exactly where those shortcuts matter
 * most - so the hints cannot simply be dropped on every touch device.
 *
 * A desktop is assumed to have a keyboard, full stop. A mobile device - a
 * phone-sized screen, or one whose only pointer is touch - is assumed to have
 * none until Alt, Ctrl or Tab arrives: keys the on-screen keyboards players use
 * do not send. Pointer media queries alone do not settle "mobile": phones with a
 * stylus (and some that have none) report a fine pointer too.
 *
 * Nothing weaker counts. "A key arrived while no field had focus" looked like
 * proof, but an Android on-screen keyboard can stay up after the command line
 * loses focus, and its next Enter then arrives with nothing focused.
 *
 * The guess only ever turns on: concluding the opposite would gain nothing (it
 * is already the assumption) and would let a hardware keyboard be forgotten the
 * moment somebody tapped a field. Alt is both how a location bind is fired and
 * proof that its hint is worth showing, so a phone with a Bluetooth keyboard
 * gets its hints back on the first shortcut its owner presses - and
 * `uiSettings.multibindKeyHints` settles it by hand for anyone who would rather
 * not wait.
 */

/** The only keys taken as proof on a mobile device. */
const HARDWARE_KEYS = new Set(['Alt', 'Control', 'Tab']);

/** Same breakpoint as the phone footer (footerMobile.css). */
const PHONE_QUERY = '(max-width: 768px), (max-height: 520px) and (pointer: coarse)';

type Listener = (present: boolean) => void;

const listeners = new Set<Listener>();
let present = false;
let started = false;

/** A phone-sized screen, or a device with no fine pointer at all (a tablet). */
function isMobileDevice(): boolean {
    if (typeof window.matchMedia !== 'function') return false;
    const matches = (query: string) => window.matchMedia(query).matches;
    return matches(PHONE_QUERY) || (matches('(any-pointer: coarse)') && !matches('(any-pointer: fine)'));
}

function markPresent(): void {
    if (present) return;
    present = true;
    for (const listener of [...listeners]) listener(present);
}

function onKeyDown(event: KeyboardEvent): void {
    if (present) return;
    if (event.altKey || event.ctrlKey || HARDWARE_KEYS.has(event.key)) markPresent();
}

function start(): void {
    if (started || typeof window === 'undefined') return;
    started = true;
    present = !isMobileDevice();
    if (present) return; // Nothing left to detect.

    document.addEventListener('keydown', onKeyDown, true);
}

/**
 * Best guess at whether the player has a physical keyboard. Starts detection on
 * first use, so nothing has to be wired at bootstrap.
 */
export function hasHardwareKeyboard(): boolean {
    start();
    return present;
}

/** Subscribe to the guess changing (it only ever turns on). */
export function subscribeHardwareKeyboard(listener: Listener): () => void {
    start();
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Test seam: forget everything detected so far and stop listening. */
export function resetHardwareKeyboardDetection(): void {
    if (started) document.removeEventListener('keydown', onKeyDown, true);
    listeners.clear();
    started = false;
    present = false;
}
