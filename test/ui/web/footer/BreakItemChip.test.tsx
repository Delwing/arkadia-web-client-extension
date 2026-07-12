import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import eventBus from "@modules/core/eventBus";
import { BreakItemChip } from "@web-ui/footer/chips";

// The forge HUD surfaces the item-break warning through this footer chip. Unlike
// the stock BreakItemWarning banner, the chip regressed to being clickable only
// when the game supplied a repair command; these tests pin the restored contract:
// a click always dismisses, and runs the command when one is present.
describe("BreakItemChip", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<BreakItemChip />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const emitBreak = (data: { text: string; command?: string } | null) =>
    act(() => {
      eventBus.emit("breakItem", data);
    });

  test("renders nothing until a warning arrives", () => {
    expect(container.querySelector(".chip")).toBeNull();
  });

  test("with a command: click runs it and dismisses", () => {
    const sent: unknown[] = [];
    const off = eventBus.on("sendCommand", (p) => sent.push(p));

    emitBreak({ text: "Twoj miecz peka!", command: "odloz zlamana bron" });
    const chip = container.querySelector("button.chip") as HTMLButtonElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain("Twoj miecz peka!");

    act(() => chip.click());
    expect(sent).toEqual([{ command: "odloz zlamana bron" }]);
    expect(container.querySelector(".chip")).toBeNull();
    off();
  });

  test("without a command: still clickable to dismiss, sends nothing", () => {
    const sent: unknown[] = [];
    const off = eventBus.on("sendCommand", (p) => sent.push(p));

    emitBreak({ text: "Twoj plaszcz rozpada ci sie w rekach." });
    const chip = container.querySelector("button.chip") as HTMLButtonElement;
    expect(chip).not.toBeNull();

    act(() => chip.click());
    expect(sent).toEqual([]);
    expect(container.querySelector(".chip")).toBeNull();
    off();
  });
});
