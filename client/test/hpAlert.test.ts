import initHpAlert from '../src/scripts/hpAlert';
import { colorString, findClosestColor } from '../src/Colors';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  println = jest.fn();
  playSound = jest.fn();
  notify = jest.fn();
  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  sendEvent(type: string, detail?: any) {
    this.emitter.emit(type, { detail });
  }
}

describe('hp alert', () => {
  let client: FakeClient;
  const color = findClosestColor('#ffa500');

  beforeEach(() => {
    client = new FakeClient();
    initHpAlert((client as unknown) as any);
    jest.clearAllMocks();
  });

  function send(hp: number) {
    client.sendEvent('gmcp.char.state', { hp });
  }

  test('beeps and prints when hp drops below 3', () => {
    send(3);
    send(1);
    expect(client.playSound).toHaveBeenCalledTimes(1);
    const plain = 'Jestes ciezko ranny';
    const msg = colorString(plain, color);
    expect(client.println).toHaveBeenCalledWith(`\n\n${msg}\n\n`);
    expect(client.notify).toHaveBeenCalledWith(plain);
  });

  test('prints again on further decrease', () => {
    send(2);
    send(1);
    send(0);
    expect(client.playSound).toHaveBeenCalledTimes(2);
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
    client.playSound.mockClear();
    client.notify.mockClear();
    send(4);
    expect(client.playSound).not.toHaveBeenCalled();
    expect(client.println).not.toHaveBeenCalled();
    expect(client.notify).not.toHaveBeenCalled();
  });
});
