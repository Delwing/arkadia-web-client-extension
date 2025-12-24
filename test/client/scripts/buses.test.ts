import initBuses from '@client/scripts/buses';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), clear: jest.fn(), newMessage: jest.fn() };
  sendEvent = jest.fn();
  sendCommand = jest.fn();
}

describe('buses triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    initBuses((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    jest.clearAllMocks();
  });

  test('exit trigger binds command and beeps', () => {
    parse('Otwarty jadacy powoz powoli zatrzymuje sie.');
    const beepCalls = client.sendEvent.mock.calls.filter(call => call[0] === 'sound:play');
    expect(beepCalls).toHaveLength(1);
    expect(beepCalls[0][1]).toEqual({ key: 'beep' });
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('wyjscie');
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('wyjscie');
  });

  test('boarding trigger binds commands', () => {
    parse('dylizans powoli zatrzymuje sie.');
    expect(client.sendEvent).toHaveBeenCalledWith('sound:play', expect.anything());
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('wem;wsiadz do dylizansu;wlm');
    callback();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wem');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wsiadz do dylizansu');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'wlm');
  });

  test('woz z plandeka triggers once', () => {
    parse('Kupiecki stojacy woz z plandeka');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
  });

  test('bryczka boarding triggers', () => {
    parse('siada w malej bryczce.');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe('wem;usiadz na bryczce;wlm');
  });
});
