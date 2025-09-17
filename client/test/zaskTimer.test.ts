import initZaskTimer from "../src/scripts/zaskTimer";

describe("zask timer", () => {
  class FakeClient extends EventTarget {
    moveMode = 0;
    sendEvent = jest.fn((type: string, detail?: any) => {
      super.dispatchEvent(new CustomEvent(type, { detail }));
    });

    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean,
    ) {
      super.addEventListener(type, listener as EventListener, options);
      return () => super.removeEventListener(type, listener as EventListener, options as any);
    }

    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: EventListenerOptions,
    ) {
      if (listener) {
        super.removeEventListener(type, listener as EventListener, options);
      }
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("counts seconds in sneak mode and reports ok after threshold", () => {
    const client = new FakeClient();
    initZaskTimer((client as unknown) as any);
    expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", null);
    client.sendEvent.mockClear();

    client.moveMode = 1;
    client.dispatchEvent(new CustomEvent("gmcp.room.info"));
    expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", { seconds: 0, ok: false });

    jest.advanceTimersByTime(29000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", { seconds: 29, ok: false });

    jest.advanceTimersByTime(1000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", expect.objectContaining({ ok: true }));

    client.dispatchEvent(new CustomEvent("moveModeChanged", { detail: 0 }));
    expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", null);

    const callCount = client.sendEvent.mock.calls.length;
    jest.advanceTimersByTime(2000);
    expect(client.sendEvent.mock.calls.length).toBe(callCount);
  });
});
