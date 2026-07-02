import initFullHpTimer from '@client/scripts/fullHpTimer';
import { EventEmitter } from 'events';
import { colorString, createColorFormat } from '@modules/core/Colors';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';

describe('full hp timer', () => {
  class FakeClient {
    private emitter = new EventEmitter();
    println = jest.fn();
    on(event: string, cb: any) {
      this.emitter.on(event, cb);
      return () => this.emitter.off(event, cb);
    }
    sendEvent = jest.fn((type: string, detail?: any) => {
      this.emitter.emit(type, detail);
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    characterStorage.setCharacter('TestChar');
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
  });

  function enable(_client: FakeClient) {
    setTestSettings({ fullHpMessage: true });
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
    expect(client.println).toHaveBeenCalledWith(msg);
    expect(client.sendEvent).toHaveBeenCalledWith('notify', { text: 'Jestes w pelni zdrowia.', system: true });
  });

  test('does not print message when reaching full hp from zero', () => {
    const client = new FakeClient();
    initFullHpTimer((client as unknown) as any);
    enable(client);
    client.sendEvent('gmcp.char.state', { hp: 0 });
    client.sendEvent('gmcp.char.state', { hp: 6 });
    jest.advanceTimersByTime(180000);
    expect(client.println).not.toHaveBeenCalled();
    expect(client.sendEvent).not.toHaveBeenCalledWith('notify', expect.anything());
  });

  test('does not print message when full hp is the first state update', () => {
    const client = new FakeClient();
    initFullHpTimer((client as unknown) as any);
    enable(client);
    client.sendEvent('gmcp.char.state', { hp: 6 });
    jest.advanceTimersByTime(180000);
    expect(client.println).not.toHaveBeenCalled();
    expect(client.sendEvent).not.toHaveBeenCalledWith('notify', expect.anything());
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
      expect(client.sendEvent).not.toHaveBeenCalledWith('notify', expect.anything());
    });
});
