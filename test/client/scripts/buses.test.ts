import initBuses from '@client/scripts/buses';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), setCategory: jest.fn(), clear: jest.fn(), clearCategory: jest.fn(), newMessage: jest.fn() };
  sendEvent = jest.fn();
  sendCommand = jest.fn();
}

describe('buses triggers', () => {
  let client: FakeClient;
  let parse: (line: string, type?: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    initBuses((client as unknown) as any);
    parse = (line: string, type = '') => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
    jest.clearAllMocks();
  });

  test('exit trigger binds command and beeps', () => {
    parse('Otwarty jadacy powoz powoli zatrzymuje sie.');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:category');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toBe('transport');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    const [category, label, callback] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    expect(category).toBe('transport');
    expect(label).toBe('wyjscie');
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('wyjscie');
  });

  test('boarding trigger binds commands', () => {
    parse('dylizans powoli zatrzymuje sie.');
    expect(client.sendEvent).toHaveBeenCalledWith('sound:category', 'transport');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    const [category, label, callback] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    expect(category).toBe('transport');
    expect(label).toBe('wem;wsiadz do dylizansu;wlm');
    callback();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wem');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wsiadz do dylizansu');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'wlm');
  });

  test('woz z plandeka triggers once', () => {
    parse('Kupiecki stojacy woz z plandeka', 'room.contents.object');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
  });

  test('bryczka boarding triggers', () => {
    parse('siada w malej bryczce.');
    expect(client.FunctionalBind.setCategory).toHaveBeenCalledTimes(1);
    const [category, label] = (client.FunctionalBind.setCategory as jest.Mock).mock.calls[0];
    expect(category).toBe('transport');
    expect(label).toBe('wem;usiadz na bryczce;wlm');
  });
});
