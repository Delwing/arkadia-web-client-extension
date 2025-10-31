import initZaskTimer from "../src/scripts/zaskTimer";
import { EventEmitter } from 'events';

describe("zask timer", () => {
  class FakeClient {
    private emitter = new EventEmitter();
    moveMode = 0;
    sendEvent = jest.fn((type: string, detail?: any) => {
      this.emitter.emit(type, detail);
    });

    on(event: string, cb: (payload: any) => void) {
      this.emitter.on(event, cb);
      return () => this.emitter.off(event, cb);
    }

    dispatchEvent(event: Event) {
      this.emitter.emit(event.type, (event as CustomEvent).detail);
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
