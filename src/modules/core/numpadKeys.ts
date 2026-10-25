/**
 * The numpad with NumLock off.
 *
 * With NumLock off the numpad digits report navigation keys (`key` is
 * `ArrowUp`, `Home`, `Clear`...) while `code` stays `Numpad8`. Binds match on
 * `code`, so they fire either way, but anything reading `key` (the command
 * line's history on ArrowUp/ArrowDown) mistakes Num8 for a real arrow.
 *
 * By default the numpad is the numpad whatever NumLock says. A keymap can opt
 * into telling the two apart (`BindSettings.numLockAware`): then a NumLock-off
 * numpad key is its own key, `Numpad8Off`, free to bind, and with nothing on it
 * it does what the navigation key does.
 */

import { globalStorage } from "./storage";

/** Numpad keys NumLock changes, with what each reports when it is off. */
const NUMLOCK_OFF_KEYS: Record<string, string> = {
    Numpad0: "Insert",
    Numpad1: "End",
    Numpad2: "ArrowDown",
    Numpad3: "PageDown",
    Numpad4: "ArrowLeft",
    Numpad5: "Clear",
    Numpad6: "ArrowRight",
    Numpad7: "Home",
    Numpad8: "ArrowUp",
    Numpad9: "PageUp",
    NumpadDecimal: "Delete",
};

/** Suffix of the bind code for a numpad key pressed with NumLock off. */
export const NUMLOCK_OFF_SUFFIX = "Off";

/**
 * Whether this keystroke is a numpad key NumLock turned into a navigation key.
 * Read from `key` rather than getModifierState: a Mac has no NumLock and its
 * numpad always types digits, which this reads as on.
 */
export function isNumLockOffNumpad(ev: Pick<KeyboardEvent, "code" | "key">): boolean {
    return ev.code in NUMLOCK_OFF_KEYS && ev.key.length > 1;
}

/** `Numpad8Off` → `Numpad8`, or null for any other code. */
export function numLockOffBase(code: string): string | null {
    if (!code.endsWith(NUMLOCK_OFF_SUFFIX)) return null;
    const base = code.slice(0, -NUMLOCK_OFF_SUFFIX.length);
    return base in NUMLOCK_OFF_KEYS ? base : null;
}

/** The navigation key a NumLock-off numpad code stands for: `Numpad8Off` → `ArrowUp`. */
export function numLockOffNavKey(code: string): string | null {
    const base = numLockOffBase(code);
    return base ? NUMLOCK_OFF_KEYS[base] : null;
}

interface NumLockState {
    aware: boolean;
    /** NumLock-off codes something in the keymap sits on. */
    bound: Set<string>;
}

let state: NumLockState | null = null;

/** Every `key` in the binds, however deep: slots, lists and maps alike. */
function collectKeys(value: unknown, out: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) collectKeys(item, out);
    } else if (value && typeof value === "object") {
        for (const [field, item] of Object.entries(value)) {
            if (field === "key" && typeof item === "string") out.add(item);
            else collectKeys(item, out);
        }
    }
}

function stateOf(binds: unknown): NumLockState {
    const keys = new Set<string>();
    collectKeys(binds, keys);
    return {
        aware: !!(binds as { numLockAware?: unknown } | undefined)?.numLockAware,
        bound: new Set([...keys].filter(key => numLockOffBase(key) !== null)),
    };
}

function currentState(): NumLockState {
    if (!state) {
        state = stateOf(globalStorage.get("binds"));
        globalStorage.onChange("binds", binds => { state = stateOf(binds); });
    }
    return state;
}

/** Whether the active keymap tells NumLock-off numpad keys apart. */
export function isNumLockAware(): boolean {
    return currentState().aware;
}

/** The code a bind matches this keystroke on: `code`, or `Numpad8Off` when NumLock is told apart. */
export function bindCodeOf(ev: Pick<KeyboardEvent, "code" | "key">, numLockAware = isNumLockAware()): string {
    return numLockAware && isNumLockOffNumpad(ev) ? ev.code + NUMLOCK_OFF_SUFFIX : ev.code;
}

/**
 * Whether a command line should leave this keystroke alone instead of reading
 * its `key` as an arrow or a page key: a NumLock-off numpad key, unless NumLock
 * is told apart and nothing is bound on that key. The command line hears the
 * key before the binds do, so it has to know a bind will take it.
 */
export function isNumpadNotNavigation(ev: Pick<KeyboardEvent, "code" | "key">): boolean {
    if (!isNumLockOffNumpad(ev)) return false;
    const { aware, bound } = currentState();
    return !aware || bound.has(ev.code + NUMLOCK_OFF_SUFFIX);
}
