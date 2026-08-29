import initCombatTimer from "@client/scripts/combatTimer";
import initCombatState from "@client/scripts/combatState";

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

    // The event clock. Live output has no server timestamp, so it is the wall clock —
    // which is what these tests exercise.
    now() {
      return Date.now();
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("starts countdown when combat ends", () => {
    const client = new FakeClient();
    initCombatState((client as unknown) as any);
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
    // combatState event is emitted, and combatTimer starts immediately
    expect(client.sendEvent).toHaveBeenCalledWith("combatState", false);
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", 32);

    jest.advanceTimersByTime(1_000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", 31);

    jest.advanceTimersByTime(31_000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", null);

    client.sendEvent.mockClear();
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "7": { attack_num: 3 } } }),
    );
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", null);
  });

  test("ignores non-combat updates before first combat", () => {
    const client = new FakeClient();
    initCombatState((client as unknown) as any);
    initCombatTimer((client as unknown) as any);
    client.sendEvent.mockClear();

    client.dispatchEvent(new CustomEvent("gmcp.char.info", { detail: { object_num: 13 } }));
    client.sendEvent.mockClear();
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "13": { attack_num: false } } }),
    );
    // combatState event is emitted, but no other events
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatState", false);
    client.sendEvent.mockClear();

    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "13": { attack_num: 2 } } }),
    );
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "13": { attack_num: false } } }),
    );
    // Timer starts immediately
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", 32);
  });

  test("stops timer when re-entering combat while timer is still running", () => {
    const client = new FakeClient();
    initCombatState((client as unknown) as any);
    initCombatTimer((client as unknown) as any);
    client.sendEvent.mockClear();

    // Setup: player enters combat
    client.dispatchEvent(new CustomEvent("gmcp.char.info", { detail: { object_num: 5 } }));
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "5": { attack_num: 10 } } }),
    );
    client.sendEvent.mockClear();

    // Player leaves combat - timer starts immediately
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "5": { attack_num: false } } }),
    );
    expect(client.sendEvent).toHaveBeenCalledWith("combatState", false);
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", 32);

    // Advance timer partway through
    jest.advanceTimersByTime(5_000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", 27);
    client.sendEvent.mockClear();

    // Player re-enters combat while timer is still running
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "5": { attack_num: 12 } } }),
    );
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", null);

    // Advance time - timer should NOT continue
    client.sendEvent.mockClear();
    jest.advanceTimersByTime(10_000);
    expect(client.sendEvent).not.toHaveBeenCalled();
  });

});
