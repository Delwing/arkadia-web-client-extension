import initCoverTimer from '@client/scripts/coverTimer';

class FakeClient {
  sendEvent = jest.fn();
  now = () => Date.now();
  private handlers = new Map<string, Array<(payload?: unknown) => void>>();

  on(event: string, handler: (payload?: unknown) => void) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  emit(event: string, payload?: unknown) {
    (this.handlers.get(event) ?? []).forEach(handler => handler(payload));
  }
}

describe('cover timer', () => {
  let client: FakeClient;

  beforeEach(() => {
    jest.useFakeTimers();
    client = new FakeClient();
    initCoverTimer((client as unknown) as any);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const coverEvents = () => client.sendEvent.mock.calls.filter(call => call[0] === 'coverTimer');

  test('starts the countdown on maneuverAttempted', () => {
    client.emit('maneuverAttempted');
    const events = coverEvents();
    expect(events).toHaveLength(1);
    expect(events[0][1]).toBeGreaterThan(4.9);
    expect(events[0][1]).toBeLessThanOrEqual(5);
  });

  test('ticks down and clears after the cooldown', () => {
    client.emit('maneuverAttempted');
    jest.advanceTimersByTime(2000);
    const midway = coverEvents().at(-1)?.[1] as number;
    expect(midway).toBeGreaterThan(2.9);
    expect(midway).toBeLessThan(3.1);

    jest.advanceTimersByTime(3100);
    expect(coverEvents().at(-1)?.[1]).toBeNull();
  });

  test('restarts the countdown when the event fires again', () => {
    client.emit('maneuverAttempted');
    jest.advanceTimersByTime(4000);
    client.emit('maneuverAttempted');
    const restarted = coverEvents().at(-1)?.[1] as number;
    expect(restarted).toBeGreaterThan(4.9);
  });

  test('ignores game lines — the lua gags own the patterns now', () => {
    // No triggers are registered at all; a Triggers instance is never touched.
    expect((client as unknown as { Triggers?: unknown }).Triggers).toBeUndefined();
    expect(coverEvents()).toHaveLength(0);
  });
});
