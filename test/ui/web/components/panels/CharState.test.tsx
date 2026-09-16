import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { CharState, type CharStateData } from "@web-ui/components/panels/CharState";

/**
 * The compact stat meters the phone footer uses in place of the text/bar modes.
 *
 * The switch is by viewport, not by the configured footer mode, so these pin
 * both halves of that: a narrow window renders meters whatever mode is set, and
 * a wide one is left alone.
 */
describe("CharState on a phone", () => {
  let container: HTMLElement;
  let root: Root;
  let narrow: boolean;

  const mountFooter = () => {
    document.body.innerHTML = `
      <div id="char-state">
        <div id="char-state-vitals">
          <span id="char-state-text"></span>
          <div id="char-state-bars"></div>
        </div>
      </div>`;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<CharState />));
  };

  const pushState = (state: Partial<CharStateData>) =>
    act(() => {
      eventBus.emit("gmcp.char.state", state);
    });

  const meters = () => document.querySelectorAll("#char-state-bars .char-state-bar--mini");

  beforeEach(() => {
    narrow = true;
    window.matchMedia = ((query: string) => ({
      media: query,
      get matches() { return narrow; },
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
    globalStorage.remove("uiSettings");
  });

  test("renders a meter per shown stat, with label, numbers and a filled track", () => {
    mountFooter();
    pushState({ hp: 5, mana: 6 });

    expect(meters()).toHaveLength(2);
    const hp = document.querySelector('.char-state-bar--mini[title="hp"]')!;
    expect(hp.querySelector(".char-state-mini-label")!.textContent).toBe("HP");
    // hp is the one stat offset by one, so 5 of 6 reads as 6/7.
    expect(hp.querySelector(".char-state-mini-value")!.textContent).toBe("6/7");
    const fill = hp.querySelector(".char-state-mini-fill") as HTMLElement;
    expect(fill.style.width).toBe("85%");
    // Urgency comes from the shared bar colours, so a meter and a desktop bar
    // read the same at a glance.
    expect(fill.className).toContain("bg-success");

    pushState({ hp: 2 });
    const wounded = document.querySelector('[title="hp"] .char-state-mini-fill') as HTMLElement;
    expect(wounded.className).toContain("bg-danger");
  });

  test("replaces the configured text mode, and hands the bars container the row", () => {
    globalStorage.set("uiSettings", { footerMode: 0 } as never);
    mountFooter();
    pushState({ hp: 5 });

    expect(meters()).toHaveLength(1);
    expect(document.getElementById("char-state-text")!.textContent).toBe("");
    expect(document.getElementById("char-state-text")!.style.display).toBe("none");
    expect(document.getElementById("char-state-bars")!.style.display).toBe("flex");
  });

  test("leaves a wide viewport on its configured mode", () => {
    narrow = false;
    mountFooter();
    pushState({ hp: 5 });

    expect(meters()).toHaveLength(0);
    expect(document.getElementById("char-state-text")!.textContent).toContain("HP:");
  });

  test("switching the compact footer off falls back to the configured mode", () => {
    mountFooter();
    pushState({ hp: 5 });
    expect(meters()).toHaveLength(1);

    act(() => {
      globalStorage.set("uiSettings", { mobileFooterCompact: false } as never);
    });

    expect(meters()).toHaveLength(0);
    expect(document.getElementById("char-state-text")!.textContent).toContain("HP:");
  });
});
