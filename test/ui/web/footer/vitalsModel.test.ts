import { readVital, visibleVitals } from "@web-ui/footer/vitalsModel";

describe("footer vitals", () => {
  test("hp is counted 1..7 and coloured by the hp thresholds", () => {
    expect(readVital("hp", 5)).toMatchObject({ value: 6, max: 7, level: "success" });
    expect(readVital("hp", 2)).toMatchObject({ value: 3, max: 7, level: "danger" });
  });

  test("a vital resting at 0 reads higher as worse, and flags the far end", () => {
    expect(readVital("encumbrance", 5)).toMatchObject({ level: "danger", alert: false });
    expect(readVital("encumbrance", 6)).toMatchObject({ level: "danger", alert: true });
    expect(readVital("mana", 0)).toMatchObject({ level: "danger", alert: true });
  });

  test("values are clamped to the scale", () => {
    expect(readVital("panic", 99).value).toBe(4);
    expect(readVital("panic", -3).value).toBe(0);
  });

  test("vitals at rest are left out unless always shown", () => {
    const state = { hp: 6, mana: 8, fatigue: 0, stuffed: 2 };
    expect(visibleVitals(state, [], [], false).map((v) => v.key)).toEqual(["hp", "fatigue", "stuffed"]);
    expect(visibleVitals(state, [], ["mana"], false).map((v) => v.key)).toEqual(["hp", "fatigue", "stuffed", "mana"]);
  });

  test("the player's order wins, unknown keys are ignored", () => {
    const state = { hp: 6, fatigue: 3 };
    expect(visibleVitals(state, ["fatigue", "bogus", "hp"], [], false).map((v) => v.key)).toEqual(["fatigue", "hp"]);
  });

  test("form is hidden where the game says the character has none", () => {
    const form = (disabled: boolean) => visibleVitals({ form: 0 }, [], [], disabled).filter((v) => v.key === "form");
    expect(form(true)).toEqual([]);
    expect(form(false).map((v) => v.key)).toEqual(["form"]);
  });
});

describe("footer vitals before the game reports them", () => {
  test("vitals without a resting value, and the always-shown ones, show as empty meters", () => {
    const shown = visibleVitals({}, [], ["mana"], false);
    expect(shown.map((v) => v.key)).toEqual(["hp", "fatigue", "mana"]);
    expect(shown.every((v) => v.unknown && v.value === 0)).toBe(true);
    expect(shown[0].max).toBe(7);
  });
});
