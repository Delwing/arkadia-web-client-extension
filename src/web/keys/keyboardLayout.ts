/**
 * The drawn keyboard in key units: `x`/`y` place a key's top-left corner,
 * `w`/`h` size it; one unit is one letter key plus its gap.
 *
 * Two layouts, because the drawing should look like the keyboard the user is
 * actually typing on: a full-size ANSI PC board (function row, main block,
 * arrow cluster, numpad) and an Apple one (full-width function row, arrows
 * tucked into the main block, numpad right next to it).
 */

import { IS_MAC } from "./platform";

export interface KeyCap {
    code: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
    /** A modifier or lock key: drawn, never bindable. */
    inert?: boolean;
}

export interface KeyboardLayout {
    caps: readonly KeyCap[];
    width: number;
    height: number;
}

function row(y: number, x: number, codes: string[], w = 1): KeyCap[] {
    return codes.map((code, i) => ({ code, x: x + i * w, y, ...(w === 1 ? {} : { w }) }));
}

const F = (n: number) => `F${n}`;
const FN_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(F);

/** The digit, letter and Shift rows — identical on both boards. */
const MAIN_ROWS: readonly KeyCap[] = [
    ...row(1.25, 0, ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"]),
    { code: "Backspace", x: 13, y: 1.25, w: 2 },
    { code: "Tab", x: 0, y: 2.25, w: 1.5 },
    ...row(2.25, 1.5, ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"]),
    { code: "Backslash", x: 13.5, y: 2.25, w: 1.5 },
    { code: "CapsLock", x: 0, y: 3.25, w: 1.75, inert: true },
    ...row(3.25, 1.75, ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"]),
    { code: "Enter", x: 12.75, y: 3.25, w: 2.25 },
    { code: "ShiftLeft", x: 0, y: 4.25, w: 2.25, inert: true },
    ...row(4.25, 2.25, ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"]),
    { code: "ShiftRight", x: 12.25, y: 4.25, w: 2.75, inert: true },
];

// ── PC: full-size ANSI ──────────────────────────────────────────────────

const PC_CAPS: readonly KeyCap[] = [
    // Function row, in groups of four.
    { code: "Escape", x: 0, y: 0 },
    ...row(0, 2, FN_KEYS.slice(0, 4)),
    ...row(0, 6.5, FN_KEYS.slice(4, 8)),
    ...row(0, 11, FN_KEYS.slice(8)),

    ...MAIN_ROWS,

    // Bottom row
    { code: "ControlLeft", x: 0, y: 5.25, w: 1.25, inert: true },
    { code: "MetaLeft", x: 1.25, y: 5.25, w: 1.25, inert: true },
    { code: "AltLeft", x: 2.5, y: 5.25, w: 1.25, inert: true },
    { code: "Space", x: 3.75, y: 5.25, w: 6.25 },
    { code: "AltRight", x: 10, y: 5.25, w: 1.25, inert: true },
    { code: "MetaRight", x: 11.25, y: 5.25, w: 1.25, inert: true },
    { code: "ContextMenu", x: 12.5, y: 5.25, w: 1.25, inert: true },
    { code: "ControlRight", x: 13.75, y: 5.25, w: 1.25, inert: true },

    // Arrows, in their own column between the main block and the numpad
    { code: "ArrowUp", x: 16.25, y: 4.25 },
    ...row(5.25, 15.25, ["ArrowLeft", "ArrowDown", "ArrowRight"]),

    // Numpad
    { code: "NumLock", x: 18.75, y: 1.25, inert: true },
    ...row(1.25, 19.75, ["NumpadDivide", "NumpadMultiply", "NumpadSubtract"]),
    ...row(2.25, 18.75, ["Numpad7", "Numpad8", "Numpad9"]),
    { code: "NumpadAdd", x: 21.75, y: 2.25, h: 2 },
    ...row(3.25, 18.75, ["Numpad4", "Numpad5", "Numpad6"]),
    ...row(4.25, 18.75, ["Numpad1", "Numpad2", "Numpad3"]),
    { code: "NumpadEnter", x: 21.75, y: 4.25, h: 2 },
    { code: "Numpad0", x: 18.75, y: 5.25, w: 2 },
    { code: "NumpadDecimal", x: 20.75, y: 5.25 },
];

export const PC_KEYBOARD: KeyboardLayout = { caps: PC_CAPS, width: 22.75, height: 6.25 };

// ── Mac: Magic Keyboard with a numeric keypad ───────────────────────────

/** Esc plus twelve F-keys stretched across the width of the main block. */
const MAC_F_WIDTH = (15 - 1.25) / 12;
/** The numpad sits right next to the main block — there is no arrow column. */
const MAC_NUM_X = 15.5;

const MAC_CAPS: readonly KeyCap[] = [
    // Function row: no gaps, the whole width of the board.
    { code: "Escape", x: 0, y: 0, w: 1.25 },
    ...row(0, 1.25, FN_KEYS, MAC_F_WIDTH),

    ...MAIN_ROWS,

    // Bottom row, ending with the arrows inside the main block.
    { code: "Fn", x: 0, y: 5.25, inert: true },
    { code: "ControlLeft", x: 1, y: 5.25, inert: true },
    { code: "AltLeft", x: 2, y: 5.25, inert: true },
    { code: "MetaLeft", x: 3, y: 5.25, w: 1.25, inert: true },
    { code: "Space", x: 4.25, y: 5.25, w: 5.5 },
    { code: "MetaRight", x: 9.75, y: 5.25, w: 1.25, inert: true },
    { code: "AltRight", x: 11, y: 5.25, inert: true },

    // Half-height arrows: up in the top half, the rest below it.
    { code: "ArrowUp", x: 13, y: 5.25, h: 0.5 },
    ...row(5.75, 12, ["ArrowLeft", "ArrowDown", "ArrowRight"]).map(k => ({ ...k, h: 0.5 })),

    // Numpad: "clear" instead of Num Lock, an "=" key, and a one-unit "+".
    { code: "NumLock", x: MAC_NUM_X, y: 1.25, inert: true },
    ...row(1.25, MAC_NUM_X + 1, ["NumpadEqual", "NumpadDivide", "NumpadMultiply"]),
    ...row(2.25, MAC_NUM_X, ["Numpad7", "Numpad8", "Numpad9", "NumpadSubtract"]),
    ...row(3.25, MAC_NUM_X, ["Numpad4", "Numpad5", "Numpad6", "NumpadAdd"]),
    ...row(4.25, MAC_NUM_X, ["Numpad1", "Numpad2", "Numpad3"]),
    { code: "NumpadEnter", x: MAC_NUM_X + 3, y: 4.25, h: 2 },
    { code: "Numpad0", x: MAC_NUM_X, y: 5.25, w: 2 },
    { code: "NumpadDecimal", x: MAC_NUM_X + 2, y: 5.25 },
];

export const MAC_KEYBOARD: KeyboardLayout = { caps: MAC_CAPS, width: MAC_NUM_X + 4, height: 6.25 };

export function keyboardFor(mac: boolean): KeyboardLayout {
    return mac ? MAC_KEYBOARD : PC_KEYBOARD;
}

const LAYOUT = keyboardFor(IS_MAC);

export const KEYBOARD = LAYOUT.caps;
export const KEYBOARD_WIDTH = LAYOUT.width;
export const KEYBOARD_HEIGHT = LAYOUT.height;

const CAP_BY_CODE = new Map(KEYBOARD.map(k => [k.code, k]));

export function keyCap(code: string): KeyCap | undefined {
    return CAP_BY_CODE.get(code);
}

/** Distance between two keys' centres, in key units. */
export function keyDistance(a: string, b: string): number {
    const ka = CAP_BY_CODE.get(a);
    const kb = CAP_BY_CODE.get(b);
    if (!ka || !kb) return Number.POSITIVE_INFINITY;
    const cx = (k: KeyCap) => k.x + (k.w ?? 1) / 2;
    const cy = (k: KeyCap) => k.y + (k.h ?? 1) / 2;
    return Math.hypot(cx(ka) - cx(kb), cy(ka) - cy(kb));
}
