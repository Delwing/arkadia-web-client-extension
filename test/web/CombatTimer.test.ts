import CombatTimer from "../../src/web/CombatTimer";

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

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<span id="combat-timer" data-enabled="1"></span>';
    container = document.getElementById("combat-timer")!;
    client = new MockClient();
    new CombatTimer(client as any);
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
});
