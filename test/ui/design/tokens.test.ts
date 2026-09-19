import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { THEMES } from "../../../src/ui/design/themes/themes.config.mjs";
import { generate } from "../../../scripts/build-design-tokens.mjs";
import { BUILT_IN_THEMES, THEME_CATALOG } from "@design";

const root = resolve(__dirname, "../../..");
const scalesPath = resolve(root, "src/ui/design/css/scales.generated.css");
const tokensPath = resolve(root, "src/ui/design/css/tokens.css");

const scalesCss = readFileSync(scalesPath, "utf8");
const tokensCss = readFileSync(tokensPath, "utf8");

/** Every `--x: value` declaration in a stylesheet. */
function declaredVariables(css: string): Set<string> {
    return new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((match) => match[1]));
}

/** Every `var(--x)` reference in a stylesheet. */
function referencedVariables(css: string): Set<string> {
    return new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((match) => match[1]));
}

describe("design tokens", () => {
    it("has a committed scales file that matches the generator", () => {
        // Regenerating in memory and comparing is what keeps `yarn
        // build:design-tokens` from being a step someone forgets to run.
        expect(scalesCss).toBe(generate());
    });

    it("keeps the TypeScript theme catalogue in step with the generator config", () => {
        expect(THEME_CATALOG.map((entry) => entry.id)).toEqual(THEMES.map((theme) => theme.id));
        expect(THEME_CATALOG.map((entry) => entry.appearance)).toEqual(THEMES.map((theme) => theme.appearance));
        expect([...BUILT_IN_THEMES]).toEqual(THEMES.map((theme) => theme.id));
    });

    it("declares a full twelve-step ramp per theme", () => {
        for (const theme of THEMES) {
            const block = scalesCss.split(`[data-ark-theme="${theme.id}"] {`)[1]?.split("\n}")[0];
            expect(block, `missing block for ${theme.id}`).toBeDefined();
            for (let step = 1; step <= 12; step += 1) {
                expect(block).toContain(`--ark-gray-${step}:`);
                expect(block).toContain(`--ark-accent-${step}:`);
                expect(block).toContain(`--ark-gray-a${step}:`);
                expect(block).toContain(`--ark-accent-a${step}:`);
            }
            expect(block).toContain("--ark-accent-contrast:");
            expect(block).toContain(`color-scheme: ${theme.appearance}`);
        }
    });

    it("resolves every token reference to something a theme or tokens.css defines", () => {
        // The failure this catches: a semantic token pointing at a step that no
        // theme actually declares, which renders as `unset` in exactly one theme.
        const defined = new Set([...declaredVariables(scalesCss), ...declaredVariables(tokensCss)]);
        const missing = [...referencedVariables(tokensCss)].filter((name) => !defined.has(name));
        expect(missing).toEqual([]);
    });

    it("keeps hard-coded colours out of the semantic layer", () => {
        // `#fff` for text on a dark solid is the one deliberate exception.
        const literals = [...tokensCss.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0]);
        expect(literals).toEqual([]);
    });
});

describe("primitive stylesheets", () => {
    const primitiveFiles = [
        "badge",
        "button",
        "callout",
        "checkbox",
        "chip",
        "dialog",
        "field",
        "input",
        "kbd",
        "layout",
        "menu",
        "segmented",
        "select",
        "spinner",
        "switch",
        "tabs",
        "toggle",
        "tooltip",
    ];

    it("is fully imported by the stylesheet entry point", () => {
        const index = readFileSync(resolve(root, "src/ui/design/css/index.css"), "utf8");
        for (const name of primitiveFiles) {
            expect(index, `${name}.css is not imported`).toContain(`../primitives/${name}.css`);
        }
    });

    it("uses tokens rather than literal colours", () => {
        for (const name of primitiveFiles) {
            const css = readFileSync(resolve(root, `src/ui/design/primitives/${name}.css`), "utf8");
            const literals = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0]);
            // Buttons and switches put plain white on a solid danger/accent fill,
            // where a themed token would be the wrong answer in every theme.
            expect(literals.filter((value) => value.toLowerCase() !== "#fff")).toEqual([]);
        }
    });
});
