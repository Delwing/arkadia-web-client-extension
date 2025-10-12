import FightTitle from "../src/FightTitle";
import { resetUiStoreForTesting, uiStore } from "./utils/uiStoreTestUtils";

describe("FightTitle", () => {
  beforeEach(() => {
    resetUiStoreForTesting();
    document.title = "Arkadia";
  });

  it("updates the document title when combat state changes", () => {
    new FightTitle({} as any);

    expect(document.title).toBe("ㅤ Arkadia");

    uiStore.setState({ charState: { attack_num: 1 } as any });
    expect(document.title).toBe("⚔ Arkadia");

    uiStore.setState({ charState: { attack_num: false } as any });
    expect(document.title).toBe("ㅤ Arkadia");
  });

  it("respects fight title preference updates", () => {
    new FightTitle({} as any);

    uiStore.setState({ charState: { attack_num: true } as any });
    expect(document.title).toBe("⚔ Arkadia");

    uiStore.setState((state) => ({
      uiPreferences: { ...state.uiPreferences, fightTitleIcon: false },
    }));
    expect(document.title).toBe("Arkadia");

    uiStore.setState((state) => ({
      uiPreferences: { ...state.uiPreferences, fightTitleIcon: true },
    }));
    expect(document.title).toBe("⚔ Arkadia");
  });
});
