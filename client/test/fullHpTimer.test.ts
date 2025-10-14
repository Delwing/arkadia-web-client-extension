import initFullHpTimer from '../src/scripts/fullHpTimer';
import appEventBus from '../src/events/app-event-bus';
import { colorString, findClosestColor } from '../src/Colors';

describe('full hp timer', () => {
  class FakeClient {
    notify = jest.fn();
    println = jest.fn();
    addEventListener(event: string, cb: any) {
      appEventBus.on(event as any, (detail: any) => cb({ detail }));
    }
    sendEvent(type: string, detail?: any) {
      appEventBus.emit(type as any, detail);
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
    appEventBus.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    appEventBus.clear();
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
    const color = findClosestColor('#00ff7f');
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

