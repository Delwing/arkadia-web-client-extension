import initShips from '../src/scripts/ships';
import Triggers from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), clear: jest.fn(), newMessage: jest.fn() };
  playSound = jest.fn();
  sendEvent = jest.fn();
  sendCommand = jest.fn();
}

describe('ships triggers', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => string;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    initShips((client as unknown) as any);
    parse = (line: string, type = '') => Triggers.prototype.parseLine.call(client.Triggers, line, type);
    jest.clearAllMocks();
  });

  test('boarding trigger binds command and beeps', () => {
    parse('Tratwa przybija do brzegu.');
    expect(client.playSound).toHaveBeenCalledTimes(1);
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
    callback();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wem');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'kup bilet');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'wsiadz na statek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'wlm');
  });

  test('galeon boarding trigger binds command without beep', () => {
    parse('Wielki trojmasztowy galeon.', 'room.contents.object');
    expect(client.playSound).not.toHaveBeenCalled();
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
  });

  test('statki trigger binds without beep', () => {
    client.playSound.mockClear();
    parse('Tajemniczy okret', 'room.contents.object');
    expect(client.playSound).not.toHaveBeenCalled();
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
    callback();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wem');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'kup bilet');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'wsiadz na statek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'wlm');
  });

  test('disembark trigger sends command and event when on ship', () => {
    parse('Tratwa przybija do brzegu.');
    const [, boardCallback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    boardCallback();
    client.FunctionalBind.set.mockClear();
    client.sendCommand.mockClear();
    client.sendEvent.mockClear();
    parse('Marynarze sprawnie cumuja');
    const [label, callback] = client.FunctionalBind.set.mock.calls.pop()!;
    expect(label).toBe('zejdz ze statku');
    callback();
    expect(client.sendCommand).toHaveBeenCalledTimes(1);
    expect(client.sendCommand).toHaveBeenCalledWith('zejdz ze statku');
    expect(client.sendEvent).toHaveBeenCalledWith('refreshPositionWhenAble');
  });

  test('disembark message starting with Jakis binds only when on ship', () => {
    parse('Tratwa przybija do brzegu.');
    const [, boardCallback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    boardCallback();
    client.FunctionalBind.set.mockClear();
    client.sendCommand.mockClear();
    client.sendEvent.mockClear();
    parse('Jakis mezczyzna krzyczy na galeonie: Doplynelismy do przystani w Urbimo! Mozna wysiadac!');
    expect(client.FunctionalBind.set).not.toHaveBeenCalled();
  });

  test('schodzi z galeonu line does not bind', () => {
    parse('Wysoki kruczowlosy mezczyzna schodzi z galeonu na brzeg.');
    expect(client.FunctionalBind.set).not.toHaveBeenCalled();
  });

  test('boarding command binds again when already on ship', () => {
    parse('Tratwa przybija do brzegu.');
    const [, boardCallback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    boardCallback();
    client.FunctionalBind.set.mockClear();
    parse('Tratwa przybija do brzegu.');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
  });

  test('prom without punctuation binds and beeps', () => {
    parse('Szeroki zielony prom.');
    expect(client.playSound).toHaveBeenCalledTimes(1);
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
  });
});
