import initIdleFullHp from '../src/scripts/idleFullHp';
import { EventEmitter } from 'events';

describe('idle full hp notification', () => {
  class FakeClient {
    private emitter = new EventEmitter();
    notify = jest.fn();
    sendEvent(type: string, detail?: any) {
      this.emitter.emit(type, { detail });
    }
    addEventListener(event: string, cb: any) {
      this.emitter.on(event, cb);
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('notifies when reaching full hp after idle', () => {
    const client = new FakeClient();
    initIdleFullHp((client as unknown) as any);
    client.sendEvent('gmcp.char.state', { hp: 5 });
    jest.advanceTimersByTime(120000);
    client.sendEvent('gmcp.char.state', { hp: 6 });
    expect(client.notify).toHaveBeenCalledWith('Masz pelne zycie');
  });

  test('does not notify before idle threshold', () => {
    const client = new FakeClient();
    initIdleFullHp((client as unknown) as any);
    client.sendEvent('gmcp.char.state', { hp: 5 });
    jest.advanceTimersByTime(119000);
    client.sendEvent('gmcp.char.state', { hp: 6 });
    expect(client.notify).not.toHaveBeenCalled();
  });

  test('command resets idle timer', () => {
    const client = new FakeClient();
    initIdleFullHp((client as unknown) as any);
    client.sendEvent('gmcp.char.state', { hp: 5 });
    jest.advanceTimersByTime(90000);
    client.sendEvent('command', 'look');
    jest.advanceTimersByTime(90000);
    client.sendEvent('gmcp.char.state', { hp: 5 });
    jest.advanceTimersByTime(30000);
    client.sendEvent('gmcp.char.state', { hp: 6 });
    expect(client.notify).toHaveBeenCalledWith('Masz pelne zycie');
  });
});
