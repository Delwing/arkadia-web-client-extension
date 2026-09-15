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
 * The starting guess is by pointer, not by screen width: a device whose ONLY
 * pointer is coarse (a phone, a tablet) is assumed to have no keyboard; anything
 * with a fine pointer as well - a desktop, a laptop with a touch screen, a
 * tablet with a trackpad case - is assumed to have one.
 *
 * From there the guess is only ever revised upwards, and only by a keystroke an
 * on-screen keyboard does not produce: a modifier, Tab, Esc, a function key - or
 * any key at all while no text field has focus, since an on-screen keyboard has
 * nothing to type into then. That is one-way on purpose: concluding the opposite
 * would gain nothing (it is already the assumption) and would let a hardware
 * keyboard be forgotten the moment somebody tapped a field.
 *
 * Alt is both how a location bind is fired and proof that its hint is worth
 * showing, so a phone with a Bluetooth keyboard gets its hints back on the first
 * shortcut its owner presses - and `uiSettings.multibindKeyHints` settles it by
 * hand for anyone who would rather not wait.
 *
 * Deliberately NOT inferred from the viewport: "focusing a field raised no
 * on-screen keyboard, so the keyboard must be physical" cannot tell a real
 * hardware keyboard from any environment that has no soft keyboard at all - a
 * headless browser, a desktop in device-emulation mode - and reports one for
 * every phone in either.
 */

/** Keys no on-screen keyboard sends. */
const HARDWARE_KEYS = new Set([
    'Alt', 'Control', 'Meta', 'Tab', 'Escape',
    'Insert', 'Home', 'End', 'PageUp', 'PageDown',
    'ScrollLock', 'Pause', 'ContextMenu',
]);

const FUNCTION_KEY = /^F\d{1,2}$/;

type Listener = (present: boolean) => void;

const listeners = new Set<Listener>();
let present = false;
let started = false;

/**
 * A device with no fine pointer at all: a phone or a tablet. A touch-screen
 * laptop answers `false` here (it has a trackpad), which is the point - it comes
 * with a keyboard and should keep its hints from the first frame.
 */
function isTouchOnlyDevice(): boolean {
    if (typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(any-pointer: coarse)').matches
        && !window.matchMedia('(any-pointer: fine)').matches;
}

function isEditable(node: Element | null): boolean {
    if (!node) return false;
    const tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return (node as HTMLElement).isContentEditable === true;
}

function markPresent(): void {
    if (present) return;
    present = true;
    for (const listener of [...listeners]) listener(present);
}

function onKeyDown(event: KeyboardEvent): void {
    if (present) return;
    if (event.altKey || event.ctrlKey || event.metaKey
        || HARDWARE_KEYS.has(event.key) || FUNCTION_KEY.test(event.key)
        || !isEditable(document.activeElement)) {
        markPresent();
    }
}

function start(): void {
    if (started || typeof window === 'undefined') return;
    started = true;
    present = !isTouchOnlyDevice();
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
