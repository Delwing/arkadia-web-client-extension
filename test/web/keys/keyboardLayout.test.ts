import { describe, expect, it } from "vitest";
import { MAC_KEYBOARD, PC_KEYBOARD, keyboardFor, type KeyboardLayout } from "@web/keys/keyboardLayout";

const layouts: [string, KeyboardLayout][] = [["PC", PC_KEYBOARD], ["Mac", MAC_KEYBOARD]];

const rect = (k: { x: number; y: number; w?: number; h?: number }) => ({
    x1: k.x, y1: k.y, x2: k.x + (k.w ?? 1), y2: k.y + (k.h ?? 1),
});

describe.each(layouts)("%s layout", (_name, layout) => {
    it("has unique key codes", () => {
        const codes = layout.caps.map(k => k.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it("keeps every key inside the board", () => {
        for (const cap of layout.caps) {
            const r = rect(cap);
            expect(r.x2, cap.code).toBeLessThanOrEqual(layout.width);
            expect(r.y2, cap.code).toBeLessThanOrEqual(layout.height);
        }
    });

    it("never overlaps two keys", () => {
        for (let i = 0; i < layout.caps.length; i++) {
            for (let j = i + 1; j < layout.caps.length; j++) {
                const a = rect(layout.caps[i]);
                const b = rect(layout.caps[j]);
                const overlap = a.x1 < b.x2 - 1e-9 && b.x1 < a.x2 - 1e-9 && a.y1 < b.y2 - 1e-9 && b.y1 < a.y2 - 1e-9;
                expect(overlap, `${layout.caps[i].code} overlaps ${layout.caps[j].code}`).toBe(false);
            }
        }
    });

    it("draws the letters, digits and F-keys", () => {
        const codes = new Set(layout.caps.map(k => k.code));
        for (const code of ["KeyQ", "KeyM", "Digit1", "Digit0", "F1", "F12", "Space", "Enter", "ArrowUp", "Numpad5"]) {
            expect(codes.has(code), code).toBe(true);
        }
    });
});

describe("keyboardFor", () => {
    it("picks the board by platform", () => {
        expect(keyboardFor(true)).toBe(MAC_KEYBOARD);
        expect(keyboardFor(false)).toBe(PC_KEYBOARD);
    });

    it("gives the Mac board Apple's keys and not the PC ones", () => {
        const mac = new Set(MAC_KEYBOARD.caps.map(k => k.code));
        expect(mac.has("Fn")).toBe(true);
        expect(mac.has("NumpadEqual")).toBe(true);
        expect(mac.has("ContextMenu")).toBe(false);
        expect(mac.has("ControlRight")).toBe(false);
    });

    it("draws the Mac arrows half height, tucked under the right shift", () => {
        const arrows = MAC_KEYBOARD.caps.filter(k => k.code.startsWith("Arrow"));
        expect(arrows).toHaveLength(4);
        expect(arrows.every(k => k.h === 0.5)).toBe(true);
        const up = arrows.find(k => k.code === "ArrowUp")!;
        const down = arrows.find(k => k.code === "ArrowDown")!;
        expect(up.x).toBe(down.x);
        expect(up.y).toBeLessThan(down.y);
    });

    it("keeps the Mac board narrower — no arrow column before the numpad", () => {
        expect(MAC_KEYBOARD.width).toBeLessThan(PC_KEYBOARD.width);
        expect(MAC_KEYBOARD.height).toBe(PC_KEYBOARD.height);
    });
});
