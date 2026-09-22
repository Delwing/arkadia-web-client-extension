/**
 * The drawn keyboard: a full-size ANSI layout (function row, main block,
 * arrows, numpad) in key units. `x`/`y` place a key's top-left corner, `w`/`h`
 * size it; one unit is one letter key plus its gap.
 */

export interface KeyCap {
    code: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
    /** A modifier or lock key: drawn, never bindable. */
    inert?: boolean;
}

function row(y: number, x: number, codes: string[]): KeyCap[] {
    return codes.map((code, i) => ({ code, x: x + i, y }));
}

const F = (n: number) => `F${n}`;

export const KEYBOARD: readonly KeyCap[] = [
    // Function row
    { code: "Escape", x: 0, y: 0 },
    ...row(0, 2, [1, 2, 3, 4].map(F)),
    ...row(0, 6.5, [5, 6, 7, 8].map(F)),
    ...row(0, 11, [9, 10, 11, 12].map(F)),

    // Digits
    ...row(1.25, 0, ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"]),
    { code: "Backspace", x: 13, y: 1.25, w: 2 },

    // Letters
    { code: "Tab", x: 0, y: 2.25, w: 1.5 },
    ...row(2.25, 1.5, ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"]),
    { code: "Backslash", x: 13.5, y: 2.25, w: 1.5 },
    { code: "CapsLock", x: 0, y: 3.25, w: 1.75, inert: true },
    ...row(3.25, 1.75, ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"]),
    { code: "Enter", x: 12.75, y: 3.25, w: 2.25 },
    { code: "ShiftLeft", x: 0, y: 4.25, w: 2.25, inert: true },
    ...row(4.25, 2.25, ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"]),
    { code: "ShiftRight", x: 12.25, y: 4.25, w: 2.75, inert: true },
    { code: "ControlLeft", x: 0, y: 5.25, w: 1.25, inert: true },
    { code: "MetaLeft", x: 1.25, y: 5.25, w: 1.25, inert: true },
    { code: "AltLeft", x: 2.5, y: 5.25, w: 1.25, inert: true },
    { code: "Space", x: 3.75, y: 5.25, w: 6.25 },
    { code: "AltRight", x: 10, y: 5.25, w: 1.25, inert: true },
    { code: "MetaRight", x: 11.25, y: 5.25, w: 1.25, inert: true },
    { code: "ContextMenu", x: 12.5, y: 5.25, w: 1.25, inert: true },
    { code: "ControlRight", x: 13.75, y: 5.25, w: 1.25, inert: true },

    // Arrows
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

export const KEYBOARD_WIDTH = 22.75;
export const KEYBOARD_HEIGHT = 6.25;

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
