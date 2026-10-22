/** How long a finger must rest before the hold counts as a right-click. */
export const LONG_PRESS_CONTEXT_MENU_MS = 500;
/** Finger travel that turns a hold into a scroll. */
const MOVE_TOLERANCE = 10;

/**
 * iOS Safari never fires `contextmenu` for a long press, so every right-click
 * menu (widgets and their Usuń, output links, list rows) was out of reach
 * there. This turns a still one-finger hold into the `contextmenu` Android
 * fires natively: a touch PointerEvent at the finger, so handlers that leave
 * touch menus to the system (the output's own menu) still do.
 *
 * When a handler takes the event (preventDefault), the lift that follows is
 * swallowed, so it neither clicks the link underneath nor closes the menu
 * that just opened.
 */
export function installLongPressContextMenu(doc: Document = document): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;
    let fired = false;
    let taken = false;

    const cancel = () => {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    };

    const fire = (target: EventTarget) => {
        timer = null;
        fired = true;
        const init = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: startX,
            clientY: startY,
            button: 2,
            buttons: 0,
        };
        const event = typeof PointerEvent === 'function'
            ? new PointerEvent('contextmenu', { ...init, pointerType: 'touch', isPrimary: true })
            : new MouseEvent('contextmenu', init);
        taken = !target.dispatchEvent(event);
    };

    const onTouchStart = (e: TouchEvent) => {
        cancel();
        fired = false;
        taken = false;
        if (e.touches.length !== 1 || !e.target) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        const target = e.target;
        timer = setTimeout(() => fire(target), LONG_PRESS_CONTEXT_MENU_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
        if (timer === null) return;
        const touch = e.touches[0];
        if (!touch || Math.hypot(touch.clientX - startX, touch.clientY - startY) > MOVE_TOLERANCE) cancel();
    };

    const onTouchEnd = (e: TouchEvent) => {
        cancel();
        if (!taken) return;
        if (e.cancelable) e.preventDefault();
        // Only the click this lift makes; a later one (a mouse on an iPad) is real.
        setTimeout(() => { taken = false; }, 400);
    };

    // A WebKit that does fire its own contextmenu would open the menu twice.
    const onNativeContextMenu = (e: Event) => {
        if (!e.isTrusted) return;
        if (fired) {
            e.preventDefault();
            e.stopImmediatePropagation();
        } else {
            cancel();
        }
    };

    // Belt and braces for the lift: a click right after a taken hold is its own.
    const onClick = (e: Event) => {
        if (!taken) return;
        taken = false;
        e.preventDefault();
        e.stopImmediatePropagation();
    };

    doc.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    doc.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    doc.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    doc.addEventListener('touchcancel', cancel, { capture: true, passive: true });
    doc.addEventListener('scroll', cancel, { capture: true, passive: true });
    doc.addEventListener('contextmenu', onNativeContextMenu, true);
    doc.addEventListener('click', onClick, true);
    return () => {
        cancel();
        doc.removeEventListener('touchstart', onTouchStart, true);
        doc.removeEventListener('touchmove', onTouchMove, true);
        doc.removeEventListener('touchend', onTouchEnd, true);
        doc.removeEventListener('touchcancel', cancel, true);
        doc.removeEventListener('scroll', cancel, true);
        doc.removeEventListener('contextmenu', onNativeContextMenu, true);
        doc.removeEventListener('click', onClick, true);
    };
}
