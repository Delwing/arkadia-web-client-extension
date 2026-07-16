import initLamp from '@client/scripts/lamp';
import Triggers from '@client/Triggers';
import { takeFromBag } from '@client/scripts/bagManager';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

vi.mock('@client/scripts/bagManager', () => ({
  takeFromBag: jest.fn(),
}));

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), clear: jest.fn(), newMessage: jest.fn() };
  println = jest.fn();
  aliases: { pattern: RegExp; callback: Function }[] = [];
  sendCommand = jest.fn();
  sendEvent = jest.fn();
}

describe('lamp triggers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    jest.useFakeTimers();
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    initLamp((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const stopped = () =>
    (client.sendEvent as jest.Mock).mock.calls.some(
      ([event, value]) => event === 'lampTimer' && value === null,
    );

  test('binds empty bottle handling', () => {
    parse('butelka oleju jest pusta.');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe(' >> Odloz olej, wez butelke do reki i napelnij lampe');
    callback();
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'odloz olej');
    expect(takeFromBag).toHaveBeenCalledWith(client, 'olej');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'napelnij lampe olejem');
  });

  test('binds bottle taking', () => {
    parse('Czym chcesz napelnic lampe');
    expect(client.FunctionalBind.set).toHaveBeenCalledTimes(1);
    const [label, callback] = (client.FunctionalBind.set as jest.Mock).mock.calls[0];
    expect(label).toBe(' >> Wez butelke do reki.');
    callback();
    expect(takeFromBag).toHaveBeenCalledWith(client, 'olej');
    expect(client.sendCommand).toHaveBeenCalledWith('napelnij lampe olejem');
  });

  test('stops the timer when the lamp burns out', () => {
    parse('Zapalasz swoja lampe.');
    jest.clearAllMocks();
    parse('lampa wypala sie i gasnie.');
    expect(stopped()).toBe(true);
  });

  test("keeps running when another person's pipe burns out (unintroduced race)", () => {
    parse('Zapalasz swoja lampe.');
    jest.clearAllMocks();
    parse('Stara wygieta fajka jakiegos tam krasnoluda wypala sie i gasnie.');
    expect(stopped()).toBe(false);
  });

  test("keeps running when another person's pipe burns out (introduced name)", () => {
    parse('Zapalasz swoja lampe.');
    jest.clearAllMocks();
    parse('Stara wygieta fajka Pabla wypala sie i gasnie.');
    expect(stopped()).toBe(false);
  });

  test('keeps running when your own pipe burns out', () => {
    parse('Zapalasz swoja lampe.');
    jest.clearAllMocks();
    parse('Kosciana fajka zwienczona osmolonymi piorami wypala sie i gasnie.');
    expect(stopped()).toBe(false);
  });
});
