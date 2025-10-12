import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";

import { runtimeEventHub } from "@client/src/runtime/event-hub";
import services from "@client/src/runtime/service-registry";
import { resetUiStoreForTesting, uiStore } from "../src/ui/store";
import CharState from "../src/CharState";
import GuildsSettings from "../src/options/GuildsSettings";
import guilds from "../src/options/guilds";
import { setCurrentCharacter } from "@client/src/storage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("UI store integration", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    localStorage.clear();
    resetUiStoreForTesting();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    jest.restoreAllMocks();
    setCurrentCharacter("");
  });

  test("CharState reflects gmcp updates and settings changes", async () => {
    document.body.innerHTML =
      '<div id="char-state" data-footer-mode="0"><div id="char-state-text"></div><div id="char-state-bars"></div></div>';
    new CharState({} as any);

    await act(async () => {
      runtimeEventHub.emit("gmcp", { path: "char.state", value: { hp: 3, mana: 5 } });
    });

    const hpSpan = document.querySelector("#char-state-text span");
    expect(hpSpan).not.toBeNull();
    expect(hpSpan!.innerHTML).toContain("HP");

    await act(async () => {
      await services.settings.update({ emojiLabels: true } as any);
    });

    expect(hpSpan!.innerHTML).toContain("❤");
  });

  test("GuildsSettings reads and writes through the store", async () => {
    setCurrentCharacter("Tester");
    container = document.createElement("div");
    document.body.appendChild(container);
    let saveHandler: () => Promise<void> | void = () => {};

    await act(async () => {
      root = createRoot(container!);
      root!.render(
        <GuildsSettings
          registerSave={(cb) => {
            saveHandler = cb;
          }}
        />,
      );
    });

    const allCheckbox = container!.querySelector("#guild-all") as HTMLInputElement;
    expect(allCheckbox).not.toBeNull();
    expect(allCheckbox.checked).toBe(false);

    await act(async () => {
      await services.settings.update({ guilds } as any);
    });

    expect(allCheckbox.checked).toBe(true);

    const updateSpy = jest.spyOn(services.settings, "update");
    await act(async () => {
      await saveHandler();
    });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        guilds: expect.arrayContaining(guilds),
        enemyGuilds: expect.any(Array),
        guildColors: expect.any(Object),
      }),
    );
  });

  test("nearby objects and team status are derived from gmcp", async () => {
    expect(uiStore.getState().nearbyObjects).toHaveLength(0);

    await act(async () => {
      runtimeEventHub.emit("gmcp", { path: "char.info", value: { object_num: 1, name: "Tester" } });
      runtimeEventHub.emit("gmcp", {
        path: "objects.data",
        value: {
          "1": { team: true, team_leader: true, desc: "Tester" },
          "2": { team: true, desc: "Ally" },
        },
      });
      runtimeEventHub.emit("gmcp", { path: "objects.nums", value: ["1", "2"] });
    });

    const state = uiStore.getState();
    expect(state.teamStatus.isLeader).toBe(true);
    expect(state.teamStatus.inTeam).toBe(true);
    expect(state.nearbyObjects.find(obj => obj.shortcut === "@")?.desc).toBe("Tester");
    expect(state.nearbyObjects.find(obj => obj.shortcut === "A")?.desc).toBe("Ally");
  });
});

