import initShips from '@client/scripts/ships';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import type { TransportTimerPayload } from '@client/types/transport';

type TransportTimerCallback = (payload: TransportTimerPayload | null) => void;

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), setCategory: jest.fn(), clear: jest.fn(), clearCategory: jest.fn(), newMessage: jest.fn() };
  sendEvent = jest.fn();
  sendCommand = jest.fn();
  private transportTimerCallback: TransportTimerCallback | null = null;

  on(event: string, callback: TransportTimerCallback) {
    if (event === 'transportTimer') {
      this.transportTimerCallback = callback;
    }
  }

  emitTransportTimer(payload: TransportTimerPayload | null) {
    this.transportTimerCallback?.(payload);
  }
}

describe('ships triggers', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    initShips((client as unknown) as any);
    parse = (line: string, type = '') => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
    jest.clearAllMocks();
  });

  test('boarding trigger binds command and beeps', () => {
    parse('Tratwa przybija do brzegu.');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('transport');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    const [category, label, callback] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    expect(category).toBe('transport');
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
    callback();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wem');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'kup bilet');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'wsiadz na statek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'wlm');
  });

  test('galeon boarding trigger binds command without beep', () => {
    parse('Wielki trojmasztowy galeon.', 'room.contents.object');
    expect(client.sendEvent).not.toHaveBeenCalledWith('sound:category', expect.anything());
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    const [category, label] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    expect(category).toBe('transport');
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
  });

  test('statki trigger binds without beep', () => {
    client.sendEvent.mockClear();
    parse('Tajemniczy okret', 'room.contents.object');
    expect(client.sendEvent).not.toHaveBeenCalledWith('sound:category', expect.anything());
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    const [category, label, callback] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    expect(category).toBe('transport');
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
    callback();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wem');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'kup bilet');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'wsiadz na statek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'wlm');
  });

  test('disembark trigger sends command and event when on ship', () => {
    parse('Tratwa przybija do brzegu.');
    const [, , boardCallback] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    boardCallback();
    client.FunctionalBind.setCategory.mockClear();
    client.sendCommand.mockClear();
    client.sendEvent.mockClear();
    parse('Marynarze sprawnie cumuja');
    const [category, label, callback] = client.FunctionalBind.setCategory.mock.calls.pop()!;
    expect(category).toBe('transport');
    expect(label).toBe('zejdz ze statku');
    callback();
    expect(client.sendCommand).toHaveBeenCalledTimes(1);
    expect(client.sendCommand).toHaveBeenCalledWith('zejdz ze statku');
    expect(client.sendEvent).toHaveBeenCalledWith('refreshPositionWhenAble');
  });

  test('disembark message starting with Jakis binds only when on ship', () => {
    parse('Tratwa przybija do brzegu.');
    const [, , boardCallback] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    boardCallback();
    client.FunctionalBind.setCategory.mockClear();
    client.sendCommand.mockClear();
    client.sendEvent.mockClear();
    parse('Jakis mezczyzna krzyczy na galeonie: Doplynelismy do przystani w Urbimo! Mozna wysiadac!');
    expect(client.FunctionalBind.setCategory).not.toHaveBeenCalled();
  });

  test('schodzi z galeonu line does not bind', () => {
    parse('Wysoki kruczowlosy mezczyzna schodzi z galeonu na brzeg.');
    expect(client.FunctionalBind.setCategory).not.toHaveBeenCalled();
  });

  test('boarding command does NOT bind when on ship', () => {
    // Simulate being on board by emitting a transport timer payload
    client.emitTransportTimer({ label: 'Tratwa', remaining: 30, total: 60 });
    parse('Tratwa przybija do brzegu.');
    // Should not bind the board commands when already on board
    expect(client.FunctionalBind.setCategory).not.toHaveBeenCalled();
  });

  test('boarding command binds when not on ship', () => {
    // Not on board
    client.emitTransportTimer(null);
    parse('Tratwa przybija do brzegu.');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    const [category, label] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    expect(category).toBe('transport');
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
  });

  test('prom without punctuation binds and beeps', () => {
    parse('Szeroki zielony prom.');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('transport');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    const [category, label] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    expect(category).toBe('transport');
    expect(label).toBe('wem;kup bilet;wsiadz na statek;wlm');
  });
});
