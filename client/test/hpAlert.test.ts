import initHpAlert from '../src/scripts/hpAlert';
import { colorString, findClosestColor } from '../src/Colors';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  println = jest.fn();
  notify = jest.fn();
  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  sendEvent = jest.fn((type: string, detail?: any) => {
    this.emitter.emit(type, { detail });
  });
}

describe('hp alert', () => {
  let client: FakeClient;
  const color = findClosestColor('#ffa500');

  beforeEach(() => {
    client = new FakeClient();
    initHpAlert((client as unknown) as any);
    jest.clearAllMocks();
    client.sendEvent('settings', { lowHpAlert: 2 });
  });

  function send(hp: number) {
    client.sendEvent('gmcp.char.state', { hp });
  }

  test('beeps and prints when hp drops to configured threshold', () => {
    send(3);
    send(1);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toEqual({ key: 'beep' });
    const plain = 'Jestes ciezko ranny';
    const msg = colorString(plain, color);
    expect(client.println).toHaveBeenCalledWith(`\n\n${msg}\n\n`);
    expect(client.notify).toHaveBeenCalledWith(plain);
  });

  test('prints again on further decrease', () => {
    send(2);
    send(1);
    send(0);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
    expect(beepCalls).toHaveLength(2);
    beepCalls.forEach(call => {
      expect(call[1]).toEqual({ key: 'beep' });
    });
    const first = colorString('Jestes ciezko ranny', color);
    const second = colorString('Jestes ledwo zywy', color);
    expect(client.println).toHaveBeenNthCalledWith(1, `\n\n${first}\n\n`);
    expect(client.println).toHaveBeenNthCalledWith(2, `\n\n${second}\n\n`);
    expect(client.notify).toHaveBeenNthCalledWith(1, 'Jestes ciezko ranny');
    expect(client.notify).toHaveBeenNthCalledWith(2, 'Jestes ledwo zywy');
  });

  test('does not trigger when hp rises', () => {
    send(2);
    client.println.mockClear();
    client.sendEvent.mockClear();
    client.notify.mockClear();
    send(4);
    expect(client.sendEvent).not.toHaveBeenCalledWith('sound:play', expect.anything());
    expect(client.println).not.toHaveBeenCalled();
    expect(client.notify).not.toHaveBeenCalled();
  });

  test('disabling alert prevents notifications', () => {
    client.sendEvent('settings', { lowHpAlert: 0 });
    send(3);
    send(1);
    expect(client.sendEvent).not.toHaveBeenCalledWith('sound:play', expect.anything());
    expect(client.println).not.toHaveBeenCalled();
    expect(client.notify).not.toHaveBeenCalled();
  });

  test('higher threshold expands alert range', () => {
    client.sendEvent('settings', { lowHpAlert: 3 });
    send(4);
    send(2);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toEqual({ key: 'beep' });
    const plain = 'Jestes w zlej kondycji';
    const msg = colorString(plain, color);
    expect(client.println).toHaveBeenCalledWith(`\n\n${msg}\n\n`);
    expect(client.notify).toHaveBeenCalledWith(plain);
  });
});
