/**
 * Small shared helpers for the one question the UI keeps asking: is this
 * interaction coming from a finger?
 *
 * It matters mostly for focus. On a desktop the command input is the resting
 * place for the keyboard focus, so clicking anything that isn't itself an input
 * should send focus back there. On a phone that same move pops the on-screen
 * keyboard over half the screen, so touch interactions deliberately leave the
 * focus alone.
 */

/**
 * Device-level guess: a coarse pointer or a touch digitizer. This is only a
 * guess — a touch-screen laptop driven with a mouse answers `true` here — so
 * prefer {@link isTouchPointerType} whenever an actual `PointerEvent` is in
 * hand and fall back to this only when it isn't.
 */
export function isLikelyTouchDevice(): boolean {
    return (
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
        navigator.maxTouchPoints > 0
    );
}

/** Phone-shaped: either a narrow viewport or a touch device. */
export function isMobileLikeViewport(): boolean {
    return window.innerWidth < 768 || isLikelyTouchDevice();
}

/**
 * Classifies a `PointerEvent.pointerType`. Browsers without pointer events (or
 * synthetic mouse events that carry no type) report an empty string — those
 * fall back to the device-level guess.
 */
export function isTouchPointerType(pointerType: string | null | undefined): boolean {
    if (pointerType === 'touch') return true;
    if (!pointerType) return isLikelyTouchDevice();
    return false;
}
