/**
 * Keep the top-overlay map clear of the iOS on-screen keyboard.
 *
 * iOS shrinks the visual viewport instead of the layout one when the keyboard
 * opens, so a map pinned to the top would slide under the browser chrome. The
 * offset is the viewport's shrink since load; it only applies while the map sits
 * at the top (`body[data-map-position="top-overlay"]`).
 */
export function installMapLayoutOffsets(
    mapContainer: HTMLElement | null,
    mainContainer: HTMLElement | null,
    win: Window = window,
): void {
    if (!mapContainer || !mainContainer) {
        return;
    }
    let keyboardOffset = 0;

    const update = () => {
        if (win.document.body?.dataset.mapPosition === 'top-overlay') {
            mapContainer.style.top = keyboardOffset + 'px';
            mainContainer.style.paddingTop = keyboardOffset + 2 + 'px';
        } else {
            mapContainer.style.top = '';
            mainContainer.style.paddingTop = '';
        }
    };

    win.addEventListener('map-position-change', update);

    const userAgent = win.navigator.userAgent;
    const viewport = win.visualViewport;
    if (viewport && (userAgent.includes('iPhone') || userAgent.includes('iPad') || userAgent.includes('iPod'))) {
        const baseOffset = win.outerHeight - viewport.height;
        viewport.addEventListener('resize', () => {
            keyboardOffset = win.outerHeight - viewport.height - baseOffset;
            update();
        });
    }

    update();
}
