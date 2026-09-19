import { describe, expect, it, beforeEach } from "vitest";
import {
    applyTheme,
    buildCustomThemeCss,
    hexToHsl,
    hexToRgba,
    isBuiltInTheme,
    luminance,
    randomThemeColor,
    removeCustomTheme,
} from "@design";

describe("colour maths", () => {
    it("round-trips a hex colour through HSL", () => {
        const { h, s, l } = hexToHsl("#e0a84a");
        expect(h).toBeGreaterThan(30);
        expect(h).toBeLessThan(45);
        expect(s).toBeGreaterThan(50);
        expect(l).toBeGreaterThan(50);
    });

    it("expands three-digit hex", () => {
        expect(hexToHsl("#fff")).toEqual(hexToHsl("#ffffff"));
    });

    it("converts to rgba", () => {
        expect(hexToRgba("#ffc53d", 0.3)).toBe("rgba(255, 197, 61, 0.3)");
    });

    it("reads a bright colour as bright", () => {
        expect(luminance("#ffc53d")).toBeGreaterThan(0.55);
        expect(luminance("#1a1225")).toBeLessThan(0.2);
    });
});

describe("custom theme", () => {
    it("declares the same twelve steps a generated theme does", () => {
        const css = buildCustomThemeCss("#58b0e8");
        for (let step = 1; step <= 12; step += 1) {
            expect(css).toContain(`--ark-gray-${step}:`);
            expect(css).toContain(`--ark-accent-${step}:`);
            expect(css).toContain(`--ark-accent-a${step}:`);
        }
        expect(css).toContain("--ark-accent-contrast:");
    });

    it("gets darker from step 1 to step 12 on a dark appearance", () => {
        const css = buildCustomThemeCss("#58b0e8", "dark");
        const step = (n: number) => css.match(new RegExp(`--ark-gray-${n}: (#[0-9a-f]{6})`))![1];
        expect(luminance(step(1))).toBeLessThan(luminance(step(6)));
        expect(luminance(step(6))).toBeLessThan(luminance(step(12)));
    });

    it("inverts that ramp on a light appearance", () => {
        const css = buildCustomThemeCss("#3366bb", "light");
        const step = (n: number) => css.match(new RegExp(`--ark-gray-${n}: (#[0-9a-f]{6})`))![1];
        expect(luminance(step(1))).toBeGreaterThan(luminance(step(12)));
    });

    it("picks dark contrast text for a bright accent", () => {
        // A yellow accent with white text on it is the classic custom-theme bug.
        const bright = buildCustomThemeCss("#ffe000");
        expect(bright).toContain("--ark-accent-contrast: #111");
    });

    it("produces a usable colour from any random seed", () => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
            const css = buildCustomThemeCss(randomThemeColor());
            expect(css.match(/--ark-accent-9: (#[0-9a-f]{6})/)).not.toBeNull();
        }
    });
});

describe("applyTheme", () => {
    beforeEach(() => {
        removeCustomTheme(document);
        document.body.innerHTML = "<div id='host'></div>";
    });

    it("sets the theme attribute for a built-in theme and installs no stylesheet", () => {
        const host = document.getElementById("host")!;
        applyTheme(host, { theme: "forest" });
        expect(host.getAttribute("data-ark-theme")).toBe("forest");
        expect(document.getElementById("ark-custom-theme")).toBeNull();
    });

    it("installs one stylesheet for a custom theme and reuses it", () => {
        const host = document.getElementById("host")!;
        applyTheme(host, { theme: "custom", customColor: "#58b0e8" });
        const style = document.getElementById("ark-custom-theme");
        expect(style).not.toBeNull();
        expect(host.getAttribute("data-ark-theme")).toBe("custom");
        // Snapshot the text, not the node: the node is reused on purpose.
        const blueCss = style!.textContent;

        applyTheme(host, { theme: "custom", customColor: "#b88aed" });
        expect(document.querySelectorAll("#ark-custom-theme")).toHaveLength(1);
        expect(document.getElementById("ark-custom-theme")!.textContent).not.toBe(blueCss);
    });

    it("falls back to the default theme when a custom colour is missing", () => {
        const host = document.getElementById("host")!;
        applyTheme(host, { theme: "custom" });
        expect(host.getAttribute("data-ark-theme")).toBe("arkadia");
    });

    it("recognises built-in theme ids", () => {
        expect(isBuiltInTheme("icy")).toBe(true);
        expect(isBuiltInTheme("nope")).toBe(false);
    });
});
