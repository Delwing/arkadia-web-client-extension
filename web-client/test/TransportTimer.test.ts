import TransportTimer from "../src/TransportTimer";
import type { TransportTimerPayload } from "@client/src/types/transport";

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, payload: TransportTimerPayload | null) {
    (this.events[event] || []).forEach(fn => fn(payload));
  }
}

describe("TransportTimer", () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<span id="transport-timer"></span>';
    container = document.getElementById("transport-timer")!;
    client = new MockClient();
    new TransportTimer(client as any);
  });

  test("hides timer when payload is null", () => {
    client.emit("transportTimer", null);
    expect(container.style.display).toBe("none");
    expect(container.textContent).toBe("");
    expect(container.className).toBe("");
  });

  test("updates timer text and class", () => {
    client.emit("transportTimer", { label: "Kreutzhofen → Hagge", remaining: 125, total: 140 });
    expect(container.textContent).toBe("Tr: Kreutzhofen → Hagge 2:05");
    expect(container.className).toBe("green");
    expect(container.style.display).toBe("block");

    client.emit("transportTimer", { label: "Kreutzhofen → Hagge", remaining: 25, total: 140 });
    expect(container.className).toBe("yellow");

    client.emit("transportTimer", { label: "Kreutzhofen → Hagge", remaining: 5, total: 140 });
    expect(container.className).toBe("red");
  });
});
