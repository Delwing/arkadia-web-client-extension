import createIdleTimer from '@client/utils/idleTimer';
import { EventEmitter } from 'events';

describe('idle timer', () => {
  class FakeClient {
    private emitter = new EventEmitter();
    on(event: string, cb: any) {
      this.emitter.on(event, cb);
    }
    sendEvent(type: string, detail?: any) {
      this.emitter.emit(type, detail);
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('marks idle after threshold and resets on command', () => {
    const client = new FakeClient();
    const timer = createIdleTimer((client as unknown) as any, 1000);
    expect(timer.isIdle()).toBe(false);
    jest.setSystemTime(1000);
    expect(timer.isIdle()).toBe(true);
    client.sendEvent('command');
    expect(timer.isIdle()).toBe(false);
  });
});
