import initHpAlert from '@client/scripts/hpAlert';
import { colorString, createColorFormat } from '@modules/core/Colors';
import { EventEmitter } from 'events';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';
import { FakeClientBase } from '../helpers/fakeClient';

class FakeClient extends FakeClientBase {
  private emitter = new EventEmitter();
  println = jest.fn();
  notify = jest.fn();
  sendCommand = jest.fn();
  keyBindingManager = {
    doubleKBind: { key: 'Equal', ctrl: true, alt: true },
  };
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  sendEvent = jest.fn((type: string, payload?: any) => {
    this.emitter.emit(type, payload);
  });
}

describe('hp alert', () => {
  let client: FakeClient;
  const color = createColorFormat('#ffa500');

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initHpAlert((client as unknown) as any);
    jest.clearAllMocks();
    setTestSettings({ lowHpAlert: 2 });
  });

  afterEach(() => {
    localStorage.clear();
  });

  function send(hp: number) {
    client.sendEvent('gmcp.char.state', { hp });
  }

  test('beeps and prints when hp drops to configured threshold', () => {
    send(3);
    send(1);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('hp');
    const plain = 'Jestes ciezko ranny';
    const msg = colorString(plain, color).prepend("\n").append('\n');
    expect(client.println).toHaveBeenCalledWith(msg);
    expect(client.notify).toHaveBeenCalledWith(plain);
  });

  test('prints again on further decrease', () => {
    send(2);
    send(1);
    send(0);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(2);
    beepCalls.forEach(call => {
      expect(call[1]).toBe('hp');
    });
    const first = colorString('Jestes ciezko ranny', color).prepend("\n").append('\n');
    const second = colorString('Jestes ledwo zywy', color).prepend("\n").append('\n');
    expect(client.println).toHaveBeenCalledWith(first);
    expect(client.println).toHaveBeenCalledWith(second);
    expect(client.notify).toHaveBeenNthCalledWith(1, 'Jestes ciezko ranny');
    expect(client.notify).toHaveBeenNthCalledWith(2, 'Jestes ledwo zywy');
  });

  test('does not trigger when hp rises', () => {
    send(2);
    client.println.mockClear();
    client.sendEvent.mockClear();
    client.notify.mockClear();
    send(4);
    expect(client.sendEvent).not.toHaveBeenCalledWith('sound:category', expect.anything());
    expect(client.println).not.toHaveBeenCalled();
    expect(client.notify).not.toHaveBeenCalled();
  });

  test('disabling alert prevents notifications', () => {
    setTestSettings({ lowHpAlert: 0 });
    send(3);
    send(1);
    expect(client.sendEvent).not.toHaveBeenCalledWith('sound:category', expect.anything());
    expect(client.println).not.toHaveBeenCalled();
    expect(client.notify).not.toHaveBeenCalled();
  });

  test('higher threshold expands alert range', () => {
    setTestSettings({ lowHpAlert: 3 });
    send(4);
    send(2);
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('hp');
    const plain = 'Jestes w zlej kondycji';
    const msg = colorString(plain, color).prepend("\n").append('\n');
    expect(client.println).toHaveBeenCalledWith(msg);
    expect(client.notify).toHaveBeenCalledWith(plain);
  });
});
