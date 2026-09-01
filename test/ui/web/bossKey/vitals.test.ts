import { fatigueToZoom, HP_PAGES, hpToPage, plotVitals, zoomToSliderPosition } from "@web-ui/bossKey/vitals";

// The whole point of the boss key overlay is that HP stays readable while the
// client is hidden, disguised as Word's page number. If this mapping drifts the
// overlay silently stops being useful, so the scale is pinned here.
describe("hpToPage", () => {
  it("shows GMCP hp on the stock 1..7 scale", () => {
    // GMCP hp is 0..6 and the stock UI displays hp + 1 out of 7 (HpTitle.ts).
    expect(hpToPage(0)).toBe(1);
    expect(hpToPage(4)).toBe(5);
    expect(hpToPage(6)).toBe(HP_PAGES);
  });

  it("falls back to a full document before any char.state arrives", () => {
    // A freshly raised overlay must not read "Strona 1 z 7" (i.e. near death).
    expect(hpToPage(undefined)).toBe(HP_PAGES);
    expect(hpToPage(Number.NaN)).toBe(HP_PAGES);
  });

  it("clamps values outside the known range", () => {
    expect(hpToPage(-3)).toBe(1);
    expect(hpToPage(99)).toBe(HP_PAGES);
  });
});

describe("fatigueToZoom", () => {
  it("reads 100% when rested, so the document looks untouched", () => {
    expect(fatigueToZoom(0)).toBe(100);
    expect(fatigueToZoom(undefined)).toBe(100);
  });

  it("falls toward Word's 10% floor as fatigue rises", () => {
    expect(fatigueToZoom(9)).toBe(10);
    expect(fatigueToZoom(5)).toBeLessThan(100);
    expect(fatigueToZoom(5)).toBeGreaterThan(10);
  });

  it("decreases monotonically", () => {
    const zooms = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(fatigueToZoom);
    for (let i = 1; i < zooms.length; i += 1) {
      expect(zooms[i]).toBeLessThan(zooms[i - 1]);
    }
  });
});

describe("zoomToSliderPosition", () => {
  it("parks the knob dead centre at 100%, like an untouched document", () => {
    expect(zoomToSliderPosition(100)).toBeCloseTo(0.5, 5);
  });

  it("stays within the track", () => {
    expect(zoomToSliderPosition(10)).toBeCloseTo(0, 5);
    expect(zoomToSliderPosition(500)).toBeCloseTo(1, 5);
    expect(zoomToSliderPosition(9999)).toBeLessThanOrEqual(1);
    expect(zoomToSliderPosition(-50)).toBeGreaterThanOrEqual(0);
  });
});

describe("plotVitals", () => {
  it("always plots the same four sustain series, in order", () => {
    // A figure whose bars appear and disappear as the game reports things draws
    // the eye, which is the opposite of what the chart is for.
    const bars = plotVitals({});

    expect(bars.map((bar) => bar.label)).toEqual(["ZM", "GLO", "PRA", "OBC"]);
    expect(bars.every((bar) => bar.value === 0)).toBe(true);
  });

  it("ignores vitals outside those four", () => {
    // HP already has the status-bar page number; the rest would just crowd it.
    const bars = plotVitals({ hp: 4, mana: 8, panic: 2, fatigue: 3 });

    expect(bars.map((bar) => bar.key)).toEqual(["fatigue", "stuffed", "soaked", "encumbrance"]);
  });

  it("plots each value against its own maximum", () => {
    const bars = plotVitals({ fatigue: 9, stuffed: 3, soaked: 0, encumbrance: 3 });
    const ratio = (label: string) => bars.find((bar) => bar.label === label)!.ratio;

    expect(ratio("ZM")).toBeCloseTo(1, 5);
    expect(ratio("GLO")).toBeCloseTo(1, 5);
    expect(ratio("PRA")).toBeCloseTo(0, 5);
    expect(ratio("OBC")).toBeCloseTo(0.5, 5);
  });

  it("keeps every ratio within the plot area", () => {
    const bars = plotVitals({ fatigue: 99, stuffed: -5, soaked: 3, encumbrance: 42 });

    for (const bar of bars) {
      expect(bar.ratio).toBeGreaterThanOrEqual(0);
      expect(bar.ratio).toBeLessThanOrEqual(1);
    }
  });
});
