import initCombatTimer from "@client/scripts/combatTimer";

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
    // Timer should not start immediately - there's a 5 second delay
    expect(client.sendEvent).not.toHaveBeenCalled();

    // Advance past the 5 second delay
    jest.advanceTimersByTime(5_000);
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
    // Wait for the 5 second delay
    jest.advanceTimersByTime(5_000);
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", 30);
  });

  test("stops timer when re-entering combat while timer is still running", () => {
    const client = new FakeClient();
    initCombatTimer((client as unknown) as any);
    client.sendEvent.mockClear();

    // Setup: player enters combat
    client.dispatchEvent(new CustomEvent("gmcp.char.info", { detail: { object_num: 5 } }));
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "5": { attack_num: 10 } } }),
    );
    client.sendEvent.mockClear();

    // Player leaves combat
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "5": { attack_num: false } } }),
    );
    // Timer doesn't start yet - still in 5 second delay
    expect(client.sendEvent).not.toHaveBeenCalled();

    // Advance past the delay - timer starts
    jest.advanceTimersByTime(5_000);
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", 30);

    // Advance timer partway through
    jest.advanceTimersByTime(5_000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("combatTimer", 25);
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

  test("cancels timer start if re-entering combat during 5 second delay", () => {
    const client = new FakeClient();
    initCombatTimer((client as unknown) as any);
    client.sendEvent.mockClear();

    // Setup: player enters combat
    client.dispatchEvent(new CustomEvent("gmcp.char.info", { detail: { object_num: 8 } }));
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "8": { attack_num: 100 } } }),
    );
    client.sendEvent.mockClear();

    // Player leaves combat - starts 5 second delay
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "8": { attack_num: false } } }),
    );
    expect(client.sendEvent).not.toHaveBeenCalled();

    // Advance 3 seconds (still within the 5 second delay)
    jest.advanceTimersByTime(3_000);
    expect(client.sendEvent).not.toHaveBeenCalled();

    // Player re-enters combat before delay completes
    client.dispatchEvent(
      new CustomEvent("gmcp.objects.data", { detail: { "8": { attack_num: 200 } } }),
    );
    // stopTimer is called which emits null (ensuring timer is stopped)
    expect(client.sendEvent).toHaveBeenCalledWith("combatTimer", null);
    client.sendEvent.mockClear();

    // Advance past when the delay would have completed
    jest.advanceTimersByTime(10_000);
    // Timer should NOT start because combat was re-entered
    expect(client.sendEvent).not.toHaveBeenCalled();
  });
});
