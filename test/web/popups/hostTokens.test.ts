import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

const hostTokensPath = "src/web/popups/popup-host-tokens.css";
const hostTokens = readFileSync(resolve(root, hostTokensPath), "utf8");
const designTokens = readFileSync(resolve(root, "src/ui/design/css/tokens.css"), "utf8");

/**
 * `--x: value;` declarations, as a name -> value map.
 *
 * First occurrence wins: tokens.css re-declares the duration ramp inside a
 * `prefers-reduced-motion` block, and that override is not the value the bridge
 * is supposed to repeat.
 */
function declarations(css: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)) {
        if (!map.has(match[1])) map.set(match[1], match[2].trim());
    }
    return map;
}

/**
 * The non-colour ramps popup-host-tokens.css has to repeat, because forge-ui
 * never loads tokens.css. Values, not roles — so they have to match exactly.
 */
const REPEATED_RAMP_PREFIXES = [
    "--ark-font-",
    "--ark-weight-",
    "--ark-leading-",
    "--ark-tracking-",
    "--ark-space-",
    "--ark-radius-",
    "--ark-control-",
    "--ark-duration-",
    "--ark-ease",
    "--ark-z-",
];

function isRepeatedRamp(name: string): boolean {
    // `--ark-text-4` is a font size; `--ark-text-faint` is a colour role and
    // comes from the host's palette instead.
    if (/^--ark-text-\d+$/.test(name)) return true;
    return REPEATED_RAMP_PREFIXES.some((prefix) => name.startsWith(prefix));
}

describe("popup host token bridge", () => {
    const host = declarations(hostTokens);
    const design = declarations(designTokens);

    it("never applies inside the stock client, where it would cycle", () => {
        // themes/bridge.css maps --popup-* onto --ark-*; this file maps back.
        // Both live at once would invalidate every variable in the cycle, so
        // every selector here must be guarded by :not(.ark-root).
        const selectors = [...hostTokens.matchAll(/^([^@/\s][^{]*)\{/gm)].map((match) =>
            match[1].trim(),
        );
        expect(selectors.length).toBeGreaterThan(0);
        for (const selector of selectors) {
            for (const part of selector.split(",")) {
                expect(part.trim(), `unguarded selector: ${part.trim()}`).toContain(
                    "body:not(.ark-root)",
                );
            }
        }
    });

    it("repeats the non-colour ramps with exactly the design system's values", () => {
        // The drift this catches: tokens.css changes --ark-space-4 to 9px and
        // every migrated popup silently keeps 8px in forge-ui.
        const drifted: string[] = [];
        for (const [name, value] of host) {
            if (!isRepeatedRamp(name)) continue;
            const expected = design.get(name);
            if (expected !== undefined && expected.replace(/\s+/g, " ") !== value.replace(/\s+/g, " ")) {
                drifted.push(`${name}: ${value} (tokens.css: ${expected})`);
            }
        }
        expect(drifted).toEqual([]);
    });

    it("covers every non-colour ramp the design system declares", () => {
        const missing = [...design.keys()].filter(
            (name) => isRepeatedRamp(name) && !host.has(name),
        );
        expect(missing).toEqual([]);
    });

    it("is imported by the stylesheet both UIs load", () => {
        const popups = readFileSync(resolve(root, "src/web/popups/popups.css"), "utf8");
        expect(popups).toContain("@import './popup-host-tokens.css';");
        // @import is only honoured at the top of a sheet.
        expect(popups.indexOf("@import './popup-host-tokens.css';")).toBeLessThan(
            popups.search(/^[^@/\s][^{]*\{/m),
        );
    });
});
