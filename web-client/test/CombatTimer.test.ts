import CombatTimer from "../src/CombatTimer";

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, payload: any) {
    (this.events[event] || []).forEach(fn => fn(payload));
  }
}

describe("CombatTimer", () => {
  let container: HTMLElement;
  let client: MockClient;
  let extension: any;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<span id="combat-timer" data-enabled="1"></span>';
    container = document.getElementById("combat-timer")!;
    extension = {
      listeners: {} as Record<string, Function[]>,
      on(event: string, listener: Function) {
        (this.listeners[event] ||= []).push(listener);
        return () => {
          this.listeners[event] = (this.listeners[event] || []).filter(fn => fn !== listener);
        };
      },
      emit(event: string, payload: any) {
        (this.listeners[event] || []).forEach(fn => fn(payload));
      },
    };
    (window as any).clientExtension = extension;
    client = new MockClient();
    new CombatTimer(client as any);
  });

  afterEach(() => {
    delete (window as any).clientExtension;
  });

  test("hides timer when payload is null", () => {
    client.emit("combatTimer", null);
    expect(container.style.display).toBe("none");
    expect(container.textContent).toBe("");
    expect(container.className).toBe("");
  });

  test("shows countdown with color thresholds", () => {
    client.emit("combatTimer", 30);
    expect(container.style.display).toBe("block");
    expect(container.textContent).toBe("Walka: 30");
    expect(container.className).toBe("red");

    client.emit("combatTimer", 15);
    expect(container.className).toBe("yellow");

    client.emit("combatTimer", 5);
    expect(container.className).toBe("green");
  });

  test("respects ui setting toggle", () => {
    client.emit("combatTimer", 12);
    expect(container.style.display).toBe("block");

    extension.emit("uiSettings", { showCombatTimer: false });
    expect(container.style.display).toBe("none");
    expect(container.textContent).toBe("");

    extension.emit("uiSettings", { showCombatTimer: true });
    client.emit("combatTimer", 8);
    expect(container.style.display).toBe("block");
    expect(container.textContent).toBe("Walka: 8");
  });
});
