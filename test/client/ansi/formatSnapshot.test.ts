import { cloneState, isDefaultState, isDimEasing, overlayState, statesEqual } from "@client/ansi/formatSnapshot.ts";

describe("formatSnapshot", () => {
    it("treats a missing state and one with nothing set as the default", () => {
        expect(isDefaultState(undefined)).toBe(true);
        expect(isDefaultState({ bold: false })).toBe(true);
        expect(isDefaultState({ hyperlink: {} })).toBe(false);
    });

    it("compares states by value, flags loosely", () => {
        expect(statesEqual({ foreground: { space: "hex", color: "#fff" } }, { foreground: { space: "hex", color: "#fff" }, bold: false })).toBe(true);
        expect(statesEqual({ italic: true }, { italic: true, cssClass: "x" })).toBe(false);
        expect(statesEqual({ hyperlink: {} }, { hyperlink: {} })).toBe(false);
    });

    it("clones deeply enough that the copy can be changed", () => {
        const original = { foreground: { space: "rgb" as const, r: 1, g: 2, b: 3 }, dim: { startOpacity: 1, endOpacity: 0, duration: 10 } };
        const copy = cloneState(original)!;
        expect(copy.foreground).not.toBe(original.foreground);
        expect(copy.dim).not.toBe(original.dim);
        expect(statesEqual(copy, original)).toBe(true);
    });

    it("overlays only what the style sets", () => {
        const link = { title: "t" };
        const result = overlayState({ background: { space: "hex", color: "#000" }, hyperlink: link, bold: true }, { bold: false, italic: true });
        expect(result.background).toEqual({ space: "hex", color: "#000" });
        expect(result.hyperlink?.title).toBe("t");
        expect(result.bold).toBe(false);
        expect(result.italic).toBe(true);
    });

    it("knows the dim easings", () => {
        expect(isDimEasing("ease-in")).toBe(true);
        expect(isDimEasing("bounce")).toBe(false);
    });
});
