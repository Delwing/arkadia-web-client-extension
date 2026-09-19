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
    // Faza 3, rodzina 2 — swiat i czas.
    "src/web/ClockPopup.css",
    "src/web/RoomInfoPopup.css",
    "src/web/WorldTimePopup.css",
    // Faza 3, rodzina 3 — podroze i transport.
    "src/web/CarriagesPopup.css",
    "src/web/TransportDebugPopup.css",
    "src/web/TransportRoutePopup.css",
    "src/web/TransportTimesDebugPopup.css",
    "src/web/TripPlannerPopup.css",
    "src/web/WalkerPopup.css",
    // Faza 3, rodzina 4 — ekwipunek i gospodarka.
    "src/web/ContractsPopup.css",
    "src/web/DepositsPopup.css",
    "src/web/FishingPopup.css",
    "src/web/LetterViewPopup.css",
    "src/web/LootPopup.css",
    "src/web/PackageReceiverPopup.css",
    "src/web/PocztaPopup.css",
    "src/web/ZlomPopup.css",
    "src/web/herbs/HerbManager.css",
    "src/web/herbs/HerbTextWindow.css",
    // Faza 3, rodzina 5 — debug i reszta.
    "src/web/CoverDebugPopup.css",
    "src/web/DataSourcesPopup.css",
    "src/web/ObjectListDemoPopup.css",
    // Faza 4 — powloka ustawien i pierwsze strony.
    "src/web/settings/settingsDialog.css",
    "src/web/options/guildsSettings.css",
    "src/web/options/magikiSettings.css",
];

/**
 * Migrated popups whose colours must not drift back into the component.
 * `MIGRATED_SHEETS` above can only see stylesheets, so a popup styled from
 * `style={{ ... }}` objects would slip the rule entirely.
 *
 * Two families arrived here from opposite directions, and both belong:
 *
 * - Faza 3, rodzina 2 (swiat i czas) has popups with NO stylesheet at all: the
 *   calendar, the sun calculator and the sun tracker are between them ~1 500
 *   lines of inline styles. Rewriting those into stylesheets would have been a
 *   rewrite, not a migration, so the rules are held against the TSX instead.
 * - Faza 3, rodzina 3 (podroze i transport) had two popups in the same state
 *   and DID extract them into stylesheets. They are listed here as well, so
 *   that the inline styling cannot quietly come back.
 *
 * `TransportRoutePopup.tsx` is deliberately absent: it passes one hex to
 * `createColorFormat` for a line printed into the GAME output, whose background
 * is the player's own setting rather than a theme surface. That is not a theme
 * decision and there is no token for it.
 *
 * `ZlomPopup.tsx` (faza 3, rodzina 4) is absent for the same reason, twice
 * over: `#dadada` is the default value of the player's own "colour a silvered
 * weapon like this" setting, which paints a line of GAME output, and `#ffffff`
 * is what `<input type="color">` falls back to when a row has no colour yet.
 * Both are seeds for a native colour picker; neither has a token form. The
 * popup's stylesheet is on MIGRATED_SHEETS and carries the theme decisions.
 */
const MIGRATED_POPUP_COMPONENTS = [
    "src/web/CalendarPopup.tsx",
    "src/web/ClockPopup.tsx",
    "src/web/RoomInfoPopup.tsx",
    "src/web/SunCalcPopup.tsx",
    "src/web/SunTrackerPopup.tsx",
    "src/web/WorldTimePopup.tsx",
    "src/web/popups/worldPalette.ts",
    "src/web/TransportDebugPopup.tsx",
    "src/web/TransportTimesDebugPopup.tsx",
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

/**
 * The two rules, written once.
 *
 * Both Phase-3 popup families landed a copy of these loops in the same merge —
 * one over stylesheets, one over components — and the bodies were identical.
 * A rule with two implementations drifts, so they live here and the describes
 * below only choose what to point them at.
 *
 * `--popup-split-gutter` is a local length, not a palette token, so it is not
 * a legacy read. A colour arriving from the GAME (a room's envColor) is data
 * rather than a theme decision, which is why only literals written INTO the
 * source count.
 */
function literalColours(source: string): string[] {
    // A hex here is a colour that survives exactly one of the eight themes.
    // `#fff` on a solid fill is the system-wide exception.
    return [...source.matchAll(/#[0-9a-f]{3,8}\b/gi)]
        .map((match) => match[0])
        .filter((value) => value.toLowerCase() !== "#fff");
}

function legacyTokenReads(source: string): string[] {
    // Half a migration is worse than none: themes/bridge.css cannot be deleted
    // while one of these still reads the old layer, and a screen on both layers
    // goes wrong in ways nobody notices.
    return [...source.matchAll(/var\(\s*(--popup-[a-z0-9-]+)/g)]
        .map((match) => match[1])
        .filter((name) => name !== "--popup-split-gutter");
}

describe("migrated screens", () => {
    for (const sheet of [...MIGRATED_SHEETS, ...BRIDGE_SHEETS]) {
        const css = readFileSync(resolve(root, sheet), "utf8");

        it(`${sheet} uses tokens rather than literal colours`, () => {
            expect(literalColours(css)).toEqual([]);
        });
    }

    for (const sheet of MIGRATED_SHEETS) {
        const css = readFileSync(resolve(root, sheet), "utf8");

        it(`${sheet} has no --popup-* reads left`, () => {
            expect(legacyTokenReads(css)).toEqual([]);
        });
    }
});

describe("migrated popup components", () => {
    for (const component of MIGRATED_POPUP_COMPONENTS) {
        const source = readFileSync(resolve(root, component), "utf8");

        it(`${component} uses tokens rather than literal colours`, () => {
            // Inline styles break a theme exactly as a stylesheet does; the
            // only difference is that nothing used to be watching them.
            expect(literalColours(source)).toEqual([]);
        });

        it(`${component} has no --popup-* reads left`, () => {
            expect(legacyTokenReads(source)).toEqual([]);
        });
    }
});
