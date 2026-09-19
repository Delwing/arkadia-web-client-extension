import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { globSync } from "node:fs";

const root = resolve(__dirname, "../../..");

/** Every stylesheet the design system and its reference screen own. */
const SHEETS = [
    "src/ui/design/css/base.css",
    "src/ui/design/css/tokens.css",
    "src/ui/design/css/scales.generated.css",
    "src/ui/logViewer/logViewer.css",
    "design/showcase.css",
    "log-viewer/log-viewer.css",
    ...globSync("src/ui/design/primitives/*.css", { cwd: root }),
];

/**
 * Structural checks, not style ones.
 *
 * These exist because of a real bug: an edit spliced a comment into the middle
 * of `.lv-log[data-timestamps='false'] .lv-log__row`, which left the
 * no-timestamps grid applying unconditionally. It compiled, it built, and every
 * other test passed — the log text column just silently collapsed to 40px.
 */
describe("stylesheet structure", () => {
    for (const sheet of SHEETS) {
        describe(sheet, () => {
            const css = readFileSync(resolve(root, sheet), "utf8");

            it("has balanced braces", () => {
                const opens = (css.match(/{/g) ?? []).length;
                const closes = (css.match(/}/g) ?? []).length;
                expect(opens).toBe(closes);
            });

            it("has no comment interrupting a selector", () => {
                // Mask comment BODIES (keeping length and the markers' places)
                // so a comment that merely talks about `{` cannot be mistaken
                // for a block boundary.
                const ranges: [number, number][] = [];
                let masked = "";
                let index = 0;
                while (index < css.length) {
                    if (css.startsWith("/*", index)) {
                        const close = css.indexOf("*/", index + 2);
                        const end = close === -1 ? css.length : close + 2;
                        ranges.push([index, end]);
                        masked += " ".repeat(end - index);
                        index = end;
                        continue;
                    }
                    masked += css[index];
                    index += 1;
                }

                for (const match of masked.matchAll(/(^|[{}])([^{}]*){/g)) {
                    const selectorStart = match.index! + match[1].length;
                    const selectorEnd = selectorStart + match[2].length;
                    const leading = match[2].length - match[2].trimStart().length;
                    const bodyStart = selectorStart + leading;
                    const interrupting = ranges.find(
                        ([from]) => from >= bodyStart && from < selectorEnd,
                    );
                    expect(
                        interrupting,
                        `comment splits the selector "${css.slice(bodyStart, selectorEnd).trim()}" in ${sheet}`,
                    ).toBeUndefined();
                }
            });

            it("declares nothing outside a block", () => {
                const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
                const outside = stripped.split(/{[^{}]*}/).join("");
                // What is left is selectors and at-rules; a stray `prop: value`
                // there means a block boundary was lost.
                expect(outside, `stray declaration in ${sheet}`).not.toMatch(/[\w-]+\s*:\s*[^;{]+;/);
            });
        });
    }
});
