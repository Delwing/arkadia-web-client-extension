import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import { AttackChip, ClockChip, ConnectionChip, CoverChip, WeaponChip } from "@web-ui/footer/chips";
import { CHIP_LONG_PRESS_MS } from "@web-ui/footer/Chip";

// The stock footer used to have its own components for these; it now renders the
// shared chips, so their behaviour is pinned here.
describe("footer chips", () => {
  let container: HTMLElement;
  let root: Root;

  const mount = (element: React.ReactElement) => act(() => root.render(element));
  const emit = (event: string, payload: unknown) => act(() => {
    eventBus.emit(event as never, payload as never);
  });
  const chip = () => container.querySelector(".chip") as HTMLElement | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  describe("ConnectionChip", () => {
    test("stays empty until something is measured", () => {
      mount(<ConnectionChip />);
      expect(chip()).toBeNull();
    });

    test("shows the round-trip time", () => {
      mount(<ConnectionChip />);
      emit("ping", 42.4);
      expect(chip()?.querySelector(".chip__val")?.textContent).toBe("42ms");
    });

    test("shows the proxy drift signed, next to the ping", () => {
      mount(<ConnectionChip />);
      emit("ping", 120);
      emit("proxy.clockOffset", -1_500);
      expect(chip()?.querySelector(".chip__val")?.textContent).toBe("120ms -1.5s");
      expect(chip()?.classList.contains("chip--warn")).toBe(true);
    });

    test("goes quiet again when the connection drops", () => {
      mount(<ConnectionChip />);
      emit("ping", 42);
      emit("ping", null);
      expect(chip()).toBeNull();
    });
  });

  describe("fixed-width values", () => {
    test("the cover chip reserves its widest state but reads as its value", () => {
      mount(<CoverChip />);
      const value = () => chip()?.querySelector(".chip__val") as HTMLElement;
      const sizes = () => Array.from(value().querySelectorAll("[data-size]")).map((el) => el.getAttribute("data-size"));
      expect(value().classList.contains("chip__sized")).toBe(true);
      expect(sizes()).toEqual(["8.8", "OK"]);
      expect(value().textContent).toBe("OK");
      emit("coverTimer", 4.26);
      expect(value().textContent).toBe("4.3");
      expect(sizes()).toEqual(["8.8", "OK"]);
    });
  });

  describe("AttackChip", () => {
    test("only the leader sees it", () => {
      mount(<AttackChip />);
      expect(chip()).toBeNull();
      emit("isTeamLeader", true);
      expect(chip()?.querySelector(".chip__val")?.textContent).toBe("A");
      emit("isTeamLeader", false);
      expect(chip()).toBeNull();
    });

    test("a click cycles A → AW → AWR → A", () => {
      mount(<AttackChip />);
      emit("isTeamLeader", true);
      const value = () => chip()?.querySelector(".chip__val")?.textContent;
      act(() => chip()!.click());
      expect(value()).toBe("AW");
      act(() => chip()!.click());
      expect(value()).toBe("AWR");
      act(() => chip()!.click());
      expect(value()).toBe("A");
    });
  });

  describe("ClockChip", () => {
    test("time with its precision, then day or night; a click opens the clock", () => {
      mount(<ClockChip />);
      emit("clock.domain.active", { domain: "Empire" });
      emit("clock.update", { domain: "Empire", hours: 6, minutes: 5.7, precision: 60, daylight: true, dayLabel: "Pon" });
      const text = chip()!.querySelector(".chip__text")!;
      expect(text.children[0].textContent).toBe("06:05 ±60");
      expect(text.children[1].textContent).toBe("dzień");

      const opened: unknown[] = [];
      const off = eventBus.on("clock.popup.open", (payload) => opened.push(payload));
      act(() => chip()!.click());
      expect(opened).toEqual([{ domain: "Empire" }]);
      off();
    });
  });

  describe("WeaponChip", () => {
    const tone = () => [...chip()!.classList].filter((c) => /^chip--(warn|danger|ok)$/.test(c));

    test("neutral out of combat, drawn or not", () => {
      mount(<WeaponChip />);
      emit("weapon_state", true);
      expect(tone()).toEqual([]);
      emit("weapon_state", false);
      expect(tone()).toEqual([]);
    });

    test("red only while fighting with the weapon sheathed", () => {
      mount(<WeaponChip />);
      emit("weapon_state", true);
      emit("combatState", true);
      expect(tone()).toEqual([]);
      emit("weapon_state", false);
      expect(tone()).toEqual(["chip--danger"]);
      emit("combatState", false);
      expect(tone()).toEqual([]);
    });

    describe("commands", () => {
      let sent: string[];
      let off: () => void;

      beforeEach(() => {
        sent = [];
        off = eventBus.on("sendCommand", ({ command }) => { sent.push(command); });
      });

      afterEach(() => {
        off();
        characterStorage.remove("settings");
        vi.useRealTimers();
      });

      const hold = () => act(() => {
        chip()!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
        vi.advanceTimersByTime(CHIP_LONG_PRESS_MS);
      });

      test("click draws while sheathed and sheathes while drawn, /dob and /op by default", () => {
        mount(<WeaponChip />);
        emit("weapon_state", false);
        act(() => chip()!.click());
        emit("weapon_state", true);
        act(() => chip()!.click());
        expect(sent).toEqual(["/dob", "/op"]);
        expect(chip()!.title).toBe("kliknij: /op");
      });

      test("uses the character's commands and follows their edits", () => {
        characterStorage.set("settings", { ...defaultSettings, weaponChipDrawCommand: "/dob 1" });
        mount(<WeaponChip />);
        emit("weapon_state", false);
        act(() => chip()!.click());
        act(() => characterStorage.set("settings", { ...defaultSettings, weaponChipDrawCommand: "/dob 2" }));
        act(() => chip()!.click());
        expect(sent).toEqual(["/dob 1", "/dob 2"]);
      });

      test("an empty command leaves the chip inert", () => {
        characterStorage.set("settings", { ...defaultSettings, weaponChipSheatheCommand: "" });
        mount(<WeaponChip />);
        emit("weapon_state", true);
        expect(chip()!.tagName).toBe("DIV");
      });

      test("a long press sends the hold command instead of the click", () => {
        vi.useFakeTimers();
        characterStorage.set("settings", { ...defaultSettings, weaponChipHoldCommand: "/dob 3" });
        mount(<WeaponChip />);
        emit("weapon_state", false);
        expect(chip()!.title).toBe("kliknij: /dob\nprzytrzymaj: /dob 3");
        hold();
        act(() => chip()!.click());
        expect(sent).toEqual(["/dob 3"]);
      });
    });
  });
});
