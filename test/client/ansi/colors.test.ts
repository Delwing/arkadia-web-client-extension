import { cloneColor, colorsEqual, colorToHex, mudletColorMap } from "@client/ansi/colors.ts";

describe("colors", () => {
    it("writes every colour space as #rrggbb", () => {
        expect(colorToHex({ space: "hex", color: "#abcdef" })).toBe("#abcdef");
        expect(colorToHex({ space: "rgb", r: 1, g: 171, b: 255 })).toBe("#01abff");
        expect(colorToHex({ space: "indexed", index: 999 })).toBe("#000000");
    });

    it("compares colours by value and space", () => {
        expect(colorsEqual({ space: "rgb", r: 1, g: 2, b: 3 }, { space: "rgb", r: 1, g: 2, b: 3 })).toBe(true);
        expect(colorsEqual({ space: "hex", color: "#010203" }, { space: "rgb", r: 1, g: 2, b: 3 })).toBe(false);
        expect(colorsEqual(undefined, undefined)).toBe(true);
    });

    it("clones a colour into a new object", () => {
        const color = { space: "indexed" as const, index: 5 };
        expect(cloneColor(color)).toEqual(color);
        expect(cloneColor(color)).not.toBe(color);
    });

    it("maps Mudlet names, lower-cased, to RGB", () => {
        const map = mudletColorMap();
        expect(map.gold).toEqual({ space: "rgb", r: 255, g: 215, b: 0 });
    });
});
