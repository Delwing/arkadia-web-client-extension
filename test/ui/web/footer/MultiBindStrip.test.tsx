import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { resetHardwareKeyboardDetection } from "@shared/dom";
import MultiBindStrip from "@web-ui/footer/MultiBindStrip";

/**
 * The bind pills' shortcut hints. "[ALT+1]" is worth its width to someone who
 * can press it and nothing but clutter to someone who cannot, so it follows the
 * hardware-keyboard guess unless the player has settled it by hand.
 */
describe("MultiBindStrip key hints", () => {
  let container: HTMLElement;
  let root: Root;
  let pointers: { coarse: boolean; fine: boolean };

  const mount = () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<MultiBindStrip />));
    act(() => {
      eventBus.emit("multibinds", {list: [{index: 1, action: "zerknij", label: "ALT+1"}]});
    });
  };

  const keys = () => container.querySelectorAll(".multi-bind-key");
  const actions = () => container.querySelectorAll(".multi-bind-action");

  beforeEach(() => {
    pointers = {coarse: true, fine: false};
    window.matchMedia = ((query: string) => ({
      media: query,
      matches: query.includes("coarse") ? pointers.coarse : pointers.fine,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    resetHardwareKeyboardDetection();
    globalStorage.remove("uiSettings");
  });

  test("are dropped on a touch-only device, leaving the action", () => {
    mount();
    expect(keys()).toHaveLength(0);
    expect(actions()[0].textContent).toBe("zerknij");
  });

  test("are kept where a keyboard is there to use them", () => {
    pointers = {coarse: false, fine: true};
    mount();
    expect(keys()[0].textContent).toBe("[ALT+1]");
  });

  // Pressing Alt is both the way to use a bind and the proof that the hints are
  // worth showing, so the first shortcut brings them back mid-session.
  test("come back as soon as a keystroke proves a keyboard", () => {
    mount();
    expect(keys()).toHaveLength(0);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", {key: "1", altKey: true, bubbles: true}));
    });

    expect(keys()[0].textContent).toBe("[ALT+1]");
  });

  test("'always' overrides the guess on a touch-only device", () => {
    globalStorage.set("uiSettings", {multibindKeyHints: "always"} as never);
    mount();
    expect(keys()[0].textContent).toBe("[ALT+1]");
  });

  test("'never' overrides the guess on a keyboard device", () => {
    pointers = {coarse: false, fine: true};
    globalStorage.set("uiSettings", {multibindKeyHints: "never"} as never);
    mount();
    expect(keys()).toHaveLength(0);
  });

  test("follows the setting being changed while it is on screen", () => {
    mount();
    expect(keys()).toHaveLength(0);

    act(() => {
      globalStorage.set("uiSettings", {multibindKeyHints: "always"} as never);
    });

    expect(keys()[0].textContent).toBe("[ALT+1]");
  });
});

/**
 * Temporary binds (api.multibinds.addTemporary) carry `temporary`, `highlight`
 * and an optional `name` shown in place of the action.
 */
describe("MultiBindStrip temporary binds", () => {
  let container: HTMLElement;
  let root: Root;

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test("marks temporary and highlighted pills and shows the name", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<MultiBindStrip />));
    act(() => {
      eventBus.emit("multibinds", {list: [
        {index: 1, action: "zerknij", label: "ALT+1", highlight: true},
        {index: 2, action: "otworz skrzynie", label: "ALT+2", name: "Skrzynia", temporary: true},
      ]});
    });

    const pills = container.querySelectorAll<HTMLButtonElement>(".multi-bind");
    expect(pills[0].classList.contains("multi-bind--highlight")).toBe(true);
    expect(pills[0].classList.contains("multi-bind--temporary")).toBe(false);
    expect(pills[0].querySelector(".multi-bind-action")?.textContent).toBe("zerknij");

    expect(pills[1].classList.contains("multi-bind--temporary")).toBe(true);
    expect(pills[1].classList.contains("multi-bind--highlight")).toBe(false);
    expect(pills[1].querySelector(".multi-bind-action")?.textContent).toBe("Skrzynia");
    expect(pills[1].title).toBe("Skrzynia: otworz skrzynie");
  });
});
