import initFullHpTimer from '@client/scripts/fullHpTimer';
import { EventEmitter } from 'events';
import { colorString, createColorFormat } from '@modules/core/Colors';

describe('full hp timer', () => {
  class FakeClient {
    private emitter = new EventEmitter();
    notify = jest.fn();
    println = jest.fn();
    on(event: string, cb: any) {
      this.emitter.on(event, cb);
      return () => this.emitter.off(event, cb);
    }
    sendEvent(type: string, detail?: any) {
      this.emitter.emit(type, detail);
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function enable(client: FakeClient) {
    client.sendEvent('settings', { fullHpMessage: true });
  }

  test('prints message after three minutes when recovering to full hp', () => {
    const client = new FakeClient();
    initFullHpTimer((client as unknown) as any);
    enable(client);
    client.sendEvent('gmcp.char.state', { hp: 5 });
    client.sendEvent('gmcp.char.state', { hp: 6 });
    jest.advanceTimersByTime(180000);
    const color = createColorFormat('#00ff7f');
    const msg = colorString('Jestes w pelni zdrowia.', color);
    expect(client.println).toHaveBeenCalledWith(`\n${msg}\n`);
    expect(client.notify).toHaveBeenCalledWith('Jestes w pelni zdrowia.');
  });

  test('does not print message when reaching full hp from zero', () => {
    const client = new FakeClient();
    initFullHpTimer((client as unknown) as any);
    enable(client);
    client.sendEvent('gmcp.char.state', { hp: 0 });
    client.sendEvent('gmcp.char.state', { hp: 6 });
    jest.advanceTimersByTime(180000);
    expect(client.println).not.toHaveBeenCalled();
    expect(client.notify).not.toHaveBeenCalled();
  });

  test('does not print message when full hp is the first state update', () => {
    const client = new FakeClient();
    initFullHpTimer((client as unknown) as any);
    enable(client);
    client.sendEvent('gmcp.char.state', { hp: 6 });
    jest.advanceTimersByTime(180000);
    expect(client.println).not.toHaveBeenCalled();
    expect(client.notify).not.toHaveBeenCalled();
  });

    test('timer is cancelled on combat', () => {
      const client = new FakeClient();
      initFullHpTimer((client as unknown) as any);
      enable(client);
      client.sendEvent('gmcp.char.info', { object_num: 1 });
      client.sendEvent('gmcp.char.state', { hp: 6 });
      client.sendEvent('gmcp.objects.data', { 1: { attack_num: 2 } });
      jest.advanceTimersByTime(180000);
      expect(client.println).not.toHaveBeenCalled();
      expect(client.notify).not.toHaveBeenCalled();
    });
});
