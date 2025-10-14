import initZaskTimer from "../src/scripts/zaskTimer";
import appEventBus from "../src/events/app-event-bus";

describe("zask timer", () => {
  class FakeClient {
    moveMode = 0;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    appEventBus.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    appEventBus.clear();
  });

  test("counts seconds in sneak mode and reports ok after threshold", () => {
    const client = new FakeClient();
    const events: any[] = [];
    const off = appEventBus.on("zaskTimer", payload => {
      events.push(payload);
    });

    initZaskTimer((client as unknown) as any);
    expect(events.at(-1)).toBeNull();
    events.length = 0;

    client.moveMode = 1;
    appEventBus.emit("gmcp.room.info", undefined);
    expect(events.at(-1)).toEqual({ seconds: 0, ok: false });
    events.length = 0;

    jest.advanceTimersByTime(29000);
    expect(events.at(-1)).toEqual({ seconds: 29, ok: false });
    events.length = 0;

    jest.advanceTimersByTime(1000);
    expect(events.at(-1)).toEqual(expect.objectContaining({ ok: true }));
    events.length = 0;

    appEventBus.emit("moveModeChanged", 0);
    expect(events.at(-1)).toBeNull();
    events.length = 0;

    const callCount = events.length;
    jest.advanceTimersByTime(2000);
    expect(events.length).toBe(callCount);

    off();
  });
});
