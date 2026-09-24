import initZaskTimer from "@client/scripts/zaskTimer";
import { EventEmitter } from 'events';

describe("zask timer", () => {
  class FakeClient {
    private emitter = new EventEmitter();
    moveMode = 0;
    sendEvent = jest.fn((type: string, detail?: any) => {
      this.emitter.emit(type, detail);
    });

    on = (event: string, cb: (payload: any) => void) => {
      this.emitter.on(event, cb);
      return () => this.emitter.off(event, cb);
    };

    triggers: Array<{ pattern: RegExp; cb: (line: any, m: RegExpMatchArray) => any }> = [];
    Triggers = {
      registerTrigger: (pattern: RegExp, cb: any) => { this.triggers.push({ pattern, cb }); },
    };

    line(text: string) {
      for (const t of this.triggers) {
        const m = text.match(t.pattern);
        if (m) t.cb(text, m);
      }
    }

    // The event clock; live output falls back to the wall clock.
    now = () => Date.now();

    dispatchEvent = (event: Event) => {
      this.emitter.emit(event.type, (event as CustomEvent).detail);
    };
  }

  let client: FakeClient;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new FakeClient();
    initZaskTimer(client as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("counts seconds in sneak mode and reports ok after threshold", () => {
    expect(client.sendEvent).toHaveBeenCalledWith("zaskTimer", null);
    client.sendEvent.mockClear();

    client.moveMode = 1;
    client.dispatchEvent(new CustomEvent("gmcp.room.info"));
    expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", {
      seconds: 0,
      ok: false
    });

    jest.advanceTimersByTime(29000);
    expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", {
      seconds: 29,
      ok: false
    });

    jest.advanceTimersByTime(1000);
    expect(client.sendEvent).toHaveBeenCalledWith("zaskTimer",
        expect.objectContaining({ ok: true })
    );
    expect(client.sendEvent).toHaveBeenLastCalledWith("zask.ready", { seconds: 30 });
    expect(client.sendEvent.mock.calls.filter(c => c[0] === "zask.ready")).toHaveLength(1);

    client.dispatchEvent(new CustomEvent("moveModeChanged", { detail: 0 }));
    expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", null);

    const callCount = client.sendEvent.mock.calls.length;
    jest.advanceTimersByTime(2000);
    expect(client.sendEvent.mock.calls.length).toBe(callCount);
  });

  const roomChange = () => client.dispatchEvent(new CustomEvent("gmcp.room.info"));
  const command = (cmd: string) => client.dispatchEvent(new CustomEvent("command", { detail: cmd }));
  const running = () => expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", { seconds: 0, ok: false });
  const stopped = () => expect(client.sendEvent).toHaveBeenLastCalledWith("zaskTimer", null);

  test("starts on a przemknij move without the move mode toggle", () => {
    command("przemknij n");
    roomChange();
    running();

    // A plain step after it stops the timer again.
    command("s");
    roomChange();
    stopped();
  });

  test("keeps counting through a queued przemknij speedwalk", () => {
    command("przemknij n");
    command("przemknij z druzyna e");
    roomChange();
    roomChange();
    running();
    roomChange();
    stopped();
  });

  test("a plain step drops a refused przemknij", () => {
    command("przemknij n");
    command("n");
    roomChange();
    expect(client.sendEvent).not.toHaveBeenCalledWith("zaskTimer", { seconds: 0, ok: false });
  });

  test("starts on hiding and stops when leaving hiding", () => {
    client.line("Chowasz sie najlepiej jak potrafisz.");
    running();
    jest.advanceTimersByTime(5000);
    client.line("Wychodzisz z ukrycia.");
    stopped();

    client.line("Chowasz sie najlepiej jak potrafisz.");
    running();
    client.line("Jest tu zbyt ciezko sie schowac, wiec jestes widoczny z powrotem.");
    stopped();
  });
});
