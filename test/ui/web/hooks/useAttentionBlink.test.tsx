import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import eventBus from "@modules/core/eventBus";
import { useAttentionBlink } from "@web-ui/hooks/useAttentionBlink.ts";
import { MailChip } from "@web-ui/footer/chips";

function Probe({ active }: { active: boolean }) {
  const blinking = useAttentionBlink(active);
  return <span data-blinking={String(blinking)} />;
}

describe("useAttentionBlink", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const render = (active: boolean) => act(() => root.render(<Probe active={active} />));
  const blinking = () => container.querySelector("span")!.getAttribute("data-blinking");
  const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  test("stays still while inactive", () => {
    render(false);
    advance(120000);
    expect(blinking()).toBe("false");
  });

  test("blinks 5s on activation, then 5s every minute", () => {
    render(true);
    expect(blinking()).toBe("true");
    advance(4999);
    expect(blinking()).toBe("true");
    advance(1);
    expect(blinking()).toBe("false");
    advance(54999);
    expect(blinking()).toBe("false");
    advance(1);
    expect(blinking()).toBe("true");
    advance(5000);
    expect(blinking()).toBe("false");
  });

  test("re-rendering while active does not restart the burst", () => {
    render(true);
    advance(5000);
    render(true);
    expect(blinking()).toBe("false");
  });

  test("deactivation stops blinking and the schedule", () => {
    render(true);
    advance(1000);
    render(false);
    expect(blinking()).toBe("false");
    advance(120000);
    expect(blinking()).toBe("false");
  });

  test("MailChip gets the blink class only during bursts", () => {
    act(() => root.render(<MailChip />));
    act(() => { eventBus.emit("gmcp.mail.state", { unreceived: true }); });
    expect(container.querySelector(".chip")!.classList.contains("attention-blink")).toBe(true);
    advance(5000);
    expect(container.querySelector(".chip")!.classList.contains("attention-blink")).toBe(false);
    act(() => { eventBus.emit("gmcp.mail.state", {}); });
    expect(container.querySelector(".chip")).toBeNull();
  });
});
