/**
 * Headless on/off state for the boss key overlay.
 *
 * Kept out of the React component so the overlay can be driven from anywhere
 * (a key handler, a footer chip, an alias) and so the toggle logic is testable
 * without a DOM. The component subscribes and renders.
 */

type Listener = (active: boolean) => void;

let active = false;
const listeners = new Set<Listener>();

/** True while the fake Word window is covering the client. */
export function isBossKeyActive(): boolean {
    return active;
}

/** Show (true) or dismiss (false) the overlay. No-op if already in that state. */
export function setBossKeyActive(next: boolean): void {
    if (active === next) return;
    active = next;
    listeners.forEach((listener) => listener(active));
}

/** Flip the overlay; returns the new state. */
export function toggleBossKey(): boolean {
    setBossKeyActive(!active);
    return active;
}

/** Subscribe to overlay state. Returns an unsubscribe function. */
export function onBossKeyChange(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * The keys that raise the overlay.
 *
 * Pause and ScrollLock are the two keys nothing else on the page --- the command
 * line, the binds system, the layout manager --- ever claims, and both are
 * reachable one-handed with no modifier, which is the entire requirement for a
 * panic key. Keyboards without a Pause key generally still have ScrollLock, and
 * vice versa, so both are accepted.
 */
export const PANIC_KEYS = ["Pause", "ScrollLock"] as const;

/** True if `key` (from `KeyboardEvent.key`) should toggle the overlay. */
export function isPanicKey(key: string): boolean {
    return (PANIC_KEYS as readonly string[]).includes(key);
}
