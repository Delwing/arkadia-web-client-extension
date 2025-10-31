import initCombatTimer from "../src/scripts/combatTimer";

describe("combat timer", () => {
  class FakeClient extends EventTarget {
    sendEvent = jest.fn((type: string, detail?: any) => {
      super.dispatchEvent(new CustomEvent(type, { detail }));
    });

    on(type: string, listener: (payload: any) => void, options?: AddEventListenerOptions | boolean) {
      const wrapped = (ev: Event) => listener((ev as CustomEvent).detail);
      super.addEventListener(type, wrapped as EventListener, options);
      return () => super.removeEventListener(type, wrapped as EventListener, options as any);
    }

    off(): void {}
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("starts countdown when combat ends", () => {
    const client = new FakeClient();
    initCombatTimer((client as unknown) as any);
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", null);
    client.sendEvent.mockClear();

    client.dispatchEvent(new CustomEvent("gmcp.char.info", { detail: { object_num: 7 } }));
    client.sendEvent.mockClear();
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "7": { attack_num: 1 } } }),
    );
    client.sendEvent.mockClear();
    expect(client.sendEvent).not.toHaveBeenCalled();

    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "7": { attack_num: false } } }),
    );
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", 30);

    jest.advanceTimersByTime(1_000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", 29);

    jest.advanceTimersByTime(29_000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", null);

    client.sendEvent.mockClear();
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "7": { attack_num: 3 } } }),
    );
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", null);
  });

  test("ignores non-combat updates before first combat", () => {
    const client = new FakeClient();
    initCombatTimer((client as unknown) as any);
    client.sendEvent.mockClear();

    client.dispatchEvent(new CustomEvent("gmcp.char.info", { detail: { object_num: 13 } }));
    client.sendEvent.mockClear();
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "13": { attack_num: false } } }),
    );
    expect(client.sendEvent).not.toHaveBeenCalled();

    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "13": { attack_num: 2 } } }),
    );
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "13": { attack_num: false } } }),
    );
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", 30);
  });
});
