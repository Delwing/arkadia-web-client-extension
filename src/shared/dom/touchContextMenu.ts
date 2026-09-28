/**
 * Touch has no right click, and the long-press that stands in for it belongs
 * to the mobile command radial. The radial therefore routes a long-press
 * itself and, when it decides a context menu should open, dispatches a
 * synthetic `contextmenu` event so the existing right-click handlers run
 * unchanged. iOS Safari never fires a native `contextmenu` for touch, so this
 * is also the only way those menus are reachable there.
 */

/** Marks an output element that opens its own menu on `contextmenu`. */
export const OUTPUT_CONTEXT_MENU_ATTR = 'data-output-context-menu';

const synthetic = new WeakSet<Event>();

export function dispatchTouchContextMenu(target: Element, x: number, y: number): void {
    const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 2,
        view: window,
    });
    synthetic.add(event);
    target.dispatchEvent(event);
}

/** True for a `contextmenu` event sent by {@link dispatchTouchContextMenu}. */
export function isTouchContextMenuEvent(event: Event): boolean {
    return synthetic.has(event);
}
