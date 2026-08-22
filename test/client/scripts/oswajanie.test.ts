import {
  parseFeedingLine,
  insertFeedingEntry,
  insertAnimalLevel,
  getActiveFeedings,
  getAnimals,
  getLevelByAnimal,
  setAnimalActive,
  linkFoods,
  dissolveFoodGroup,
  getFoodGroupMap,
  foodWordDistance,
} from "@client/scripts/oswajanie";
import { characterStorage } from "@modules/core/storage";

function groupKey(food: string, map: Map<string, string>): string {
  return map.get(food) ?? food;
}

// Each test uses a unique character so the shared in-memory IndexedDB (provided
// by fake-indexeddb/auto) stays isolated without tearing the database down.
let charCounter = 0;
function useFreshCharacter(): string {
  const name = `TamerChar${charCounter++}`;
  characterStorage.setCharacter(name);
  return name;
}

describe("parseFeedingLine", () => {
  it("splits on the two-word marker 'kawalkiem miesa'", () => {
    expect(parseFeedingLine("wilka kawalkiem miesa")).toEqual({
      animal: "wilka",
      food: "kawalkiem miesa",
    });
  });

  it("splits on the one-word marker 'miesem'", () => {
    expect(parseFeedingLine("ostrodzioba podstarzala sojke miesem")).toEqual({
      animal: "ostrodzioba podstarzala sojke",
      food: "miesem",
    });
  });

  it("handles a simple two-token line", () => {
    expect(parseFeedingLine("kot ryba")).toEqual({ animal: "kot", food: "ryba" });
  });

  it("falls back to last-two-tokens-as-food for longer marker-less lines", () => {
    expect(parseFeedingLine("wielki bury gorski kot suszona ryba")).toEqual({
      animal: "wielki bury gorski kot",
      food: "suszona ryba",
    });
  });

  it("returns null when there is not enough to split", () => {
    expect(parseFeedingLine("kot")).toBeNull();
    expect(parseFeedingLine("   ")).toBeNull();
  });
});

describe("oswajanie per-character storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("scopes feeding records to the active character", async () => {
    const a = useFreshCharacter();
    await insertFeedingEntry("wilk", "miesem");

    const active = await getActiveFeedings();
    expect(active).toHaveLength(1);
    expect(active[0].animal).toBe("wilk");
    expect(active[0].character).toBe(a);

    // A different character sees none of the first character's data.
    useFreshCharacter();
    expect(await getActiveFeedings()).toHaveLength(0);
    expect(await getAnimals()).toHaveLength(0);
  });

  it("lists distinct animals with their active flag", async () => {
    useFreshCharacter();
    await insertFeedingEntry("wilk", "miesem");
    await insertFeedingEntry("wilk", "miesem");
    await insertFeedingEntry("lis", "kurczak");

    const animals = await getAnimals();
    expect(animals.map((x) => x.animal).sort()).toEqual(["lis", "wilk"]);
    expect(animals.every((x) => x.active)).toBe(true);
  });

  it("deactivates an animal so it drops out of active feedings", async () => {
    useFreshCharacter();
    await insertFeedingEntry("wilk", "miesem");
    await setAnimalActive("wilk", false);

    expect(await getActiveFeedings()).toHaveLength(0);
    const animals = await getAnimals();
    expect(animals).toEqual([{ animal: "wilk", active: false }]);
  });

  it("defaults the taming level to 'plochliwe' before any evaluation", async () => {
    useFreshCharacter();
    await insertFeedingEntry("wilk", "miesem");
    expect(await getLevelByAnimal("wilk", Date.now())).toBe("plochliwe");
  });

  it("returns a recorded level for a timestamp at or after the evaluation", async () => {
    useFreshCharacter();
    await insertAnimalLevel("wilk", "nerwowe");
    // A timestamp well in the future sees the recorded level.
    expect(await getLevelByAnimal("wilk", Date.now() + 60_000)).toBe("nerwowe");
  });
});

describe("foodWordDistance", () => {
  it("ignores the 'kawalkiem' filler word", () => {
    // With "kawalkiem" dropped, "kawalkiem miesa" -> "miesa", close to "miesem".
    expect(foodWordDistance("miesem", "kawalkiem miesa")).toBeLessThanOrEqual(2);
    // The filler word itself must not add distance.
    expect(foodWordDistance("miesa", "kawalkiem miesa")).toBe(0);
  });

  it("ranks the same food nearer than an unrelated one", () => {
    const same = foodWordDistance("miesem", "kawalkiem miesa");
    const different = foodWordDistance("miesem", "kurczak pieczony");
    expect(same).toBeLessThan(different);
  });

  it("returns 0 for identical foods", () => {
    expect(foodWordDistance("ryba", "ryba")).toBe(0);
  });
});

describe("oswajanie food grouping (global)", () => {
  // Unique food names per test keep the shared global foodGroups store isolated.
  let foodSeq = 0;
  const food = (base: string) => `${base}_${foodSeq}`;
  beforeEach(() => {
    foodSeq++;
    characterStorage.setCharacter("Tamer");
  });

  it("treats unlinked foods as separate groups", async () => {
    const map = await getFoodGroupMap();
    expect(groupKey(food("miesem"), map)).not.toBe(groupKey(food("kawalkiem"), map));
  });

  it("links two foods into one shared group", async () => {
    const a = food("miesem");
    const b = food("kawalkiem miesa");
    await linkFoods(a, b);

    const map = await getFoodGroupMap();
    expect(groupKey(a, map)).toBe(groupKey(b, map));
  });

  it("merges a third food into an existing group transitively", async () => {
    const a = food("a");
    const b = food("b");
    const c = food("c");
    await linkFoods(a, b);
    await linkFoods(b, c);

    const map = await getFoodGroupMap();
    expect(groupKey(a, map)).toBe(groupKey(c, map));
  });

  it("merges two pre-existing groups when any of their members are linked", async () => {
    const a = food("a");
    const b = food("b");
    const c = food("c");
    const d = food("d");
    await linkFoods(a, b); // group 1
    await linkFoods(c, d); // group 2
    await linkFoods(a, c); // merge

    const map = await getFoodGroupMap();
    const key = groupKey(a, map);
    expect(groupKey(b, map)).toBe(key);
    expect(groupKey(c, map)).toBe(key);
    expect(groupKey(d, map)).toBe(key);
  });

  it("dissolves a whole group so its foods become standalone again", async () => {
    const a = food("a");
    const b = food("b");
    await linkFoods(a, b);
    await dissolveFoodGroup(a);

    const map = await getFoodGroupMap();
    expect(map.has(a)).toBe(false);
    expect(map.has(b)).toBe(false);
    expect(groupKey(a, map)).not.toBe(groupKey(b, map));
  });

  it("keeps food links global regardless of active character", async () => {
    const a = food("a");
    const b = food("b");
    characterStorage.setCharacter("CharOne");
    await linkFoods(a, b);

    characterStorage.setCharacter("CharTwo");
    const map = await getFoodGroupMap();
    expect(groupKey(a, map)).toBe(groupKey(b, map));
  });
});

