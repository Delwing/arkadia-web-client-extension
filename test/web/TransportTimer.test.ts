import TransportTimer from "../src/TransportTimer";

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, payload: any) {
    (this.events[event] || []).forEach(fn => fn(payload));
  }
}

describe("TransportTimer", () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    localStorage.clear();
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

    client.emit("transportTimer", { label: "Kreutzhofen → Hagge", remaining: 0, total: 140 });
    expect(container.textContent).toBe("Tr: Kreutzhofen → Hagge 0:00");
    expect(container.className).toBe("red");
    expect(container.style.display).toBe("block");
  });

  test("shows label without timer when duration is unknown", () => {
    client.emit("transportTimer", { label: "Kreutzhofen → Tajemnicze miejsce", remaining: null, total: null });
    expect(container.textContent).toBe("Tr: Kreutzhofen → Tajemnicze miejsce");
    expect(container.className).toBe("");
    expect(container.style.display).toBe("block");
  });

  test("hides label when option disabled", () => {
    client.emit("uiSettings", { showTransportLabel: false });
    client.emit("transportTimer", { label: "Kreutzhofen → Hagge", remaining: 125, total: 140 });
    expect(container.style.display).toBe("none");
    expect(container.textContent).toBe("");
    expect(container.className).toBe("");

    client.emit("transportTimer", { label: "Kreutzhofen → Tajemnicze miejsce", remaining: null, total: null });
    expect(container.style.display).toBe("none");
    expect(container.textContent).toBe("");
  });
});
