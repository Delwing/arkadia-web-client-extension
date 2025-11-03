import { act } from "react";
import eventBus from "@client/src/eventBus.ts";
import mountStatusIndicators from "../src/statusIndicators";

describe("PackageStatus indicator", () => {
  let cleanup: ReturnType<typeof mountStatusIndicators> | undefined;
  let container: HTMLElement;

  beforeEach(() => {
    eventBus.clear();
    document.body.innerHTML = '<div id="status-indicators"></div>';
    act(() => {
      cleanup = mountStatusIndicators();
    });
    container = document.getElementById("package-status")!;
  });

  afterEach(() => {
    act(() => {
      cleanup?.destroy();
    });
    eventBus.clear();
  });

  test("hides when no data", () => {
    act(() => {
      eventBus.emit("packageStatus", null);
    });
    expect(container.style.display).toBe("none");
    expect(container.textContent).toBe("");
  });

  test("shows recipient and time", () => {
    act(() => {
      eventBus.emit("packageStatus", { recipient: "Bob", seconds: 70 });
    });
    expect(container.textContent).toBe("📦: Bob 1:10");
    expect(container.style.display).toBe("block");

    act(() => {
      eventBus.emit("packageStatus", { recipient: "Alice" });
    });
    expect(container.textContent).toBe("📦: Alice");
  });
});
