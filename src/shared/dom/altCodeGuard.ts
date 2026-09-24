/**
 * Swallows the Windows Alt code a bound Alt+numpad shortcut leaves behind.
 *
 * Holding Alt and pressing numpad digits is how Windows types characters by
 * code point: on Alt release the OS inserts the composed character (Alt+8 is
 * "◘", Alt+2 is "☻"). That happens below the page, so cancelling the digit's
 * keydown - which every bind does - does not stop it, and each "przemknij na"
 * step typed a symbol into the command line.
 *
 * The page does get one last say: the character still arrives as a keypress
 * and a beforeinput, and cancelling either keeps it out of the field. So when
 * an Alt hold included a numpad key some bind cancelled, the next character
 * inserted right after Alt goes up is dropped. Alt holds with no bound numpad
 * key pass untouched, so typing real Alt codes keeps working.
 *
 * `defaultPrevented` is read at Alt release, not at the digit's keydown: bind
 * listeners sit on window in the bubble phase, and by the time Alt comes up
 * every listener has had its turn.
 */

/** The composed character follows Alt release immediately; anything later is real typing. */
const SUPPRESS_WINDOW_MS = 100;

let installed = false;

/**
 * By `code`, not `key`: Chrome reports the Alt release that completes an Alt
 * code with the composed character as its `key` ("♦"), never "Alt".
 */
const isAltKey = (event: KeyboardEvent) => event.code === 'AltLeft' || event.code === 'AltRight';

export function installAltCodeGuard(target: Window = window): () => void {
    if (installed) return () => {};
    installed = true;

    const doc = target.document;
    let numpadDuringAlt: KeyboardEvent[] = [];
    let suppressUntil = 0;

    const onKeyDown = (event: KeyboardEvent) => {
        if (isAltKey(event)) {
            numpadDuringAlt = [];
            return;
        }
        suppressUntil = 0;
        if (event.altKey && event.code.startsWith('Numpad')) numpadDuringAlt.push(event);
    };

    const onKeyUp = (event: KeyboardEvent) => {
        if (!isAltKey(event)) return;
        if (numpadDuringAlt.some(e => e.defaultPrevented)) suppressUntil = performance.now() + SUPPRESS_WINDOW_MS;
        numpadDuringAlt = [];
    };

    const swallow = (event: Event) => {
        if (!suppressUntil) return;
        if (performance.now() > suppressUntil) {
            suppressUntil = 0;
            return;
        }
        if (event instanceof InputEvent && event.inputType !== 'insertText') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        // keypress and beforeinput both carry the one character; clear on the
        // second of them (beforeinput), or whichever the browser sends last.
        if (event.type === 'beforeinput') suppressUntil = 0;
    };

    const opts = {capture: true};
    doc.addEventListener('keydown', onKeyDown, opts);
    doc.addEventListener('keyup', onKeyUp, opts);
    doc.addEventListener('keypress', swallow, opts);
    doc.addEventListener('beforeinput', swallow, opts);

    return () => {
        doc.removeEventListener('keydown', onKeyDown, opts);
        doc.removeEventListener('keyup', onKeyUp, opts);
        doc.removeEventListener('keypress', swallow, opts);
        doc.removeEventListener('beforeinput', swallow, opts);
        installed = false;
    };
}
