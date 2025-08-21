import initFullHpTimer from '../src/scripts/fullHpTimer';
import { EventEmitter } from 'events';
import { colorString, findClosestColor } from '../src/Colors';

describe('full hp timer', () => {
  class FakeClient {
    private emitter = new EventEmitter();
    notify = jest.fn();
    println = jest.fn();
    addEventListener(event: string, cb: any) {
      this.emitter.on(event, cb);
    }
    sendEvent(type: string, detail?: any) {
      this.emitter.emit(type, { detail });
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

  test('prints message after three minutes at full hp', () => {
    const client = new FakeClient();
    initFullHpTimer((client as unknown) as any);
    enable(client);
    client.sendEvent('gmcp.char.state', { hp: 6 });
    jest.advanceTimersByTime(180000);
    const color = findClosestColor('#00ff7f');
    const msg = colorString('Jestes w pelni zdrowia.', color);
    expect(client.println).toHaveBeenCalledWith(`\n\n${msg}\n\n`);
    expect(client.notify).toHaveBeenCalledWith('Jestes w pelni zdrowia.');
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

