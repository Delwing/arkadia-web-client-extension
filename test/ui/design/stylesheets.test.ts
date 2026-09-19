import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { globSync } from "node:fs";

const root = resolve(__dirname, "../../..");

/**
 * Screens migrated onto the design system. Each one reads `--ark-*` only, so
 * each one is held to the same no-hex rule as the system itself.
 *
 * Grow this list as UI_MIGRATION.md's phases land. A migrated screen left off
 * it keeps the tokens but loses the rule that keeps them honest.
 */
const MIGRATED_SHEETS = [
    "src/ui/logViewer/logViewer.css",
    "design/showcase.css",
    "log-viewer/log-viewer.css",
    // Faza 2 — przegladarka logow w kliencie.
    "src/web/logBrowser.css",
    // Faza 3, rodzina 1 — walka i status.
    "src/web/CombatPopup.css",
    "src/web/CombatStatusPopup.css",
    "src/web/CechyPopup.css",
    "src/web/EnemyResistancesPopup.css",
    "src/web/PostepyPopup.css",
    "src/web/Postepy2Popup.css",
    "src/web/StatPopup.css",
    "src/web/ZabiciPopup.css",
    "src/web/Zabici2Popup.css",
    // Faza 3, rodzina 3 — podroze i transport.
    "src/web/CarriagesPopup.css",
    "src/web/TransportDebugPopup.css",
    "src/web/TransportRoutePopup.css",
    "src/web/TransportTimesDebugPopup.css",
    "src/web/TripPlannerPopup.css",
    "src/web/WalkerPopup.css",
    // Faza 4 — powloka ustawien i pierwsze strony.
    "src/web/settings/settingsDialog.css",
    "src/web/options/guildsSettings.css",
    "src/web/options/magikiSettings.css",
];

/**
 * Sheets held to the no-hex rule but NOT to the no-`--popup-*` rule: reading
 * the old layer is the whole job of a bridge. themes/bridge.css maps old onto
 * new for the stock client, popup-host-tokens.css maps it back for forge-ui.
 */
const BRIDGE_SHEETS = ["src/web/popups/popup-host-tokens.css"];

/** Every stylesheet the design system and its reference screen own. */
const SHEETS = [
    "src/ui/design/css/base.css",
    "src/ui/design/css/tokens.css",
    "src/ui/design/css/scales.generated.css",
    ...MIGRATED_SHEETS,
    ...BRIDGE_SHEETS,
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

describe("migrated screens", () => {
    for (const sheet of [...MIGRATED_SHEETS, ...BRIDGE_SHEETS]) {
        const css = readFileSync(resolve(root, sheet), "utf8");

        it(`${sheet} uses tokens rather than literal colours`, () => {
            // A hex here is a colour that survives exactly one of the eight
            // themes. `#fff` on a solid fill is the system-wide exception.
            const literals = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0]);
            expect(literals.filter((value) => value.toLowerCase() !== "#fff")).toEqual([]);
        });
    }

    for (const sheet of MIGRATED_SHEETS) {
        const css = readFileSync(resolve(root, sheet), "utf8");

        it(`${sheet} has no --popup-* reads left`, () => {
            // Half a migration is worse than none: themes/bridge.css cannot be
            // deleted while one of these still reads the old layer, and a
            // screen on both layers goes wrong in ways nobody notices.
            // `--popup-split-gutter` is a local length, not a palette token.
            const legacy = [...css.matchAll(/var\(\s*(--popup-[a-z0-9-]+)/g)]
                .map((match) => match[1])
                .filter((name) => name !== "--popup-split-gutter");
            expect(legacy).toEqual([]);
        });
    }
});
