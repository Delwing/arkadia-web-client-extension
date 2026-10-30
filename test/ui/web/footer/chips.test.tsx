import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import { AttackChip, ClockChip, ConnectionChip, CoverChip, WeaponChip } from "@web-ui/footer/chips";
import { CHIP_LONG_PRESS_MS } from "@web-ui/footer/Chip";
import { TOOLTIP_DELAY_MS } from "@shared/dom/tooltip";
import { sunHour } from "@client/scripts/sunModel";

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
  /** Hovers the chip and reads its tooltip back, one "label: content" line per row. */
  const hoverTip = () => {
    const fake = vi.isFakeTimers();
    if (!fake) vi.useFakeTimers();
    act(() => {
      chip()!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    });
    if (!fake) vi.useRealTimers();
    const tooltip = document.getElementById("hover-tooltip")!;
    return {
      header: tooltip.querySelector(".hover-tooltip__header")?.textContent,
      rows: [...tooltip.querySelectorAll(".hover-tooltip__entry")].map((row) =>
        [row.querySelector(".hover-tooltip__label")?.textContent, row.querySelector(".hover-tooltip__content")?.textContent]
          .filter(Boolean).join(": ")),
    };
  };

  beforeAll(() => {
    const tooltip = document.createElement("div");
    tooltip.id = "hover-tooltip";
    document.body.appendChild(tooltip);
  });

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

    test("graphs the last minutes of ping in the tooltip, broken over a disconnect", () => {
      mount(<ConnectionChip />);
      emit("ping", 80);
      emit("pingHistory", { samples: [
        { at: 0, ms: 40, restart: true },
        { at: 3_000, ms: 60 },
        { at: 60_000, ms: 450, restart: true },
        { at: 63_000, ms: 80 },
      ] });
      const tip = hoverTip();
      expect(tip.rows).toContain("Ping: 80 ms");
      expect(tip.rows).toContain("5 min: min 40 · śr. 158 · maks. 450 ms");
      const graph = document.querySelector("#hover-tooltip .chip-tip-ping")!;
      expect(graph.querySelectorAll(".chip-tip-ping__line")).toHaveLength(2);
      expect(graph.querySelector(".chip-tip-ping__warn")).not.toBeNull();
      expect(graph.querySelector(".chip-tip-ping__scale")?.textContent).toBe("450 ms");
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

    test("starts from the stored mode, announced or not", () => {
      characterStorage.set("attack_mode", "AWR");
      try {
        mount(<AttackChip />);
        emit("isTeamLeader", true);
        expect(chip()?.querySelector(".chip__val")?.textContent).toBe("AWR");
      } finally {
        characterStorage.remove("attack_mode");
      }
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

    test("the tooltip carries the date, season, day part, a day bar and the sun times", () => {
      mount(<ClockChip />);
      emit("clock.domain.active", { domain: "Empire" });
      emit("clock.update", { domain: "Empire", hours: 12, minutes: 0, daylight: true, season: 0, sunrise: 6, sunset: 19, dayLabel: "10 Pflugzeit" });
      expect(hoverTip()).toEqual({
        header: "10 Pflugzeit",
        rows: ["Godzina: 12:00", "Pora roku: wiosna", "Pora dnia: dzień", "Wschód: 06:00", "Zachód: 19:00", "kliknij: otwórz okno czasu"],
      });
      const now = document.querySelector<HTMLElement>("#hover-tooltip .chip-tip-daybar__now")!;
      expect(now.style.left).toBe("50%");

      // The tooltip follows the clock while it is open.
      emit("clock.update", { domain: "Empire", hours: 18, minutes: 0, daylight: true, season: 0, sunrise: 6, sunset: 19, dayLabel: "10 Pflugzeit" });
      expect(document.querySelector("#hover-tooltip")!.textContent).toContain("zmierzch");

      // Clicking the chip keeps it up; a press anywhere else puts it away.
      const tooltip = document.getElementById("hover-tooltip")!;
      act(() => { chip()!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
      expect(tooltip.classList.contains("show")).toBe(true);
      act(() => { document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
      expect(tooltip.classList.contains("show")).toBe(false);
    });

    test("the sun times also say when the next sunrise and sunset happen in real time", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 17, 14, 0, 0));
      try {
        mount(<ClockChip />);
        emit("clock.domain.active", { domain: "Empire" });
        const sunrise = sunHour("Empire", 10, "sunrise");
        const sunset = sunHour("Empire", 10, "sunset");
        emit("clock.update", { domain: "Empire", dayOfYear: 10, hours: 12, minutes: 0, daylight: true, season: 0, sunrise, sunset, dayLabel: "10 Pflugzeit" });
        // A game hour is two real minutes. Today's sunset is still ahead; the next
        // sunrise is tomorrow's.
        const sunsetIn = (sunset - 12) * 2;
        const sunriseIn = (24 - 12 + sunHour("Empire", 11, "sunrise")) * 2;
        const at = (minutes: number) => `14:${String(minutes).padStart(2, "0")}`;
        const rows = hoverTip().rows;
        expect(rows).toContain(`Zachód: ${sunset}:00 · ${at(sunsetIn)} (za ${sunsetIn} min)`);
        expect(rows).toContain(`Wschód: 0${sunrise}:00 · ${at(sunriseIn)} (za ${sunriseIn} min)`);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("WeaponChip", () => {
    const tone = () => [...chip()!.classList].filter((c) => /^chip--(warn|danger|ok)$/.test(c));

    test("green while drawn, neutral while sheathed out of combat", () => {
      mount(<WeaponChip />);
      emit("weapon_state", true);
      expect(tone()).toEqual(["chip--ok"]);
      emit("weapon_state", false);
      expect(tone()).toEqual([]);
    });

    test("red only while fighting with the weapon sheathed", () => {
      mount(<WeaponChip />);
      emit("weapon_state", true);
      emit("combatState", true);
      expect(tone()).toEqual(["chip--ok"]);
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
        expect(hoverTip()).toEqual({ header: "Broń", rows: ["kliknij: /op"] });
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
        expect(hoverTip().rows).toEqual(["kliknij: /dob", "przytrzymaj: /dob 3"]);
        hold();
        act(() => chip()!.click());
        expect(sent).toEqual(["/dob 3"]);
      });
    });
  });
});
