import PackageHelper from '../src/PackageHelper';
import { colorStringInLine, findClosestColor } from '../src/Colors';

describe('PackageHelper', () => {
  let helper: any;
  let client: any;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = {
      Triggers: {
        registerTrigger: jest.fn(),
        registerOneTimeTrigger: jest.fn(),
        registerMultilineTrigger: jest.fn(),
        removeTrigger: jest.fn(),
        removeByTag: jest.fn(),
      },
      OutputHandler: {
        makeClickable: jest.fn(),
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      sendEvent: jest.fn(),
      createButton: jest.fn(() => ({ remove: jest.fn() })),
      println: jest.fn(),
      Map: { currentRoom: { id: 123 } },
      port: { postMessage: jest.fn() },
      FunctionalBind: { set: jest.fn(), clear: jest.fn(), newMessage: jest.fn() },
      sendCommand: jest.fn(),
    };
    helper = new PackageHelper(client);
    client.Triggers.registerTrigger.mockClear();
    client.Triggers.registerMultilineTrigger.mockClear();
  });

  test('constructor initializes helper by default', () => {
    const c = {
      Triggers: {
        registerTrigger: jest.fn(),
        registerOneTimeTrigger: jest.fn(),
        registerMultilineTrigger: jest.fn(),
        removeTrigger: jest.fn(),
        removeByTag: jest.fn(),
      },
      OutputHandler: {
        makeClickable: jest.fn(),
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      sendEvent: jest.fn(),
      createButton: jest.fn(() => ({ remove: jest.fn() })),
      println: jest.fn(),
      Map: { currentRoom: { id: 1 } },
      port: { postMessage: jest.fn() },
      FunctionalBind: { set: jest.fn(), clear: jest.fn(), newMessage: jest.fn() },
      sendCommand: jest.fn(),
    };
    const h = new PackageHelper(c as any);
    expect(c.Triggers.registerTrigger).toHaveBeenCalled();
    expect(h.enabled).toBe(true);
  });

  test('packageLineCallback returns clickable line and stores package', () => {
    const cb = helper['packageLineCallback']();
    client.OutputHandler.makeClickable.mockReturnValue('click');

    const rawLine = " |1. Bob 1/2/3 5";
    const packageLineRegex = /^ \|\s*(?<heavy>\*)?\s*(?<number>\d+)\. (?<name>.*?)(?:, (?<city>[\w' ]+?))?\s+(?<gold>\d+)\/\s?(?<silver>\d+)\/\s?(?<copper>\d+)\s+(?:nieogr\.|(?<time>\d+))/;
    const match = rawLine.match(packageLineRegex)!;
    const result = cb(rawLine, '', match);

    expect(result).toBe('click');
    expect(helper['packages']).toEqual([{ name: 'Bob', time: '5' }]);
    expect(client.OutputHandler.makeClickable).toHaveBeenCalledTimes(1);
    const call = client.OutputHandler.makeClickable.mock.calls[0];
    const expectedColor = colorStringInLine(rawLine, 'Bob', findClosestColor('#aaaaaa'));
    expect(call[0]).toBe(expectedColor);
    expect(call[1]).toBe('Bob');
    expect(call[3]).toBe('wybierz paczke 1');
    call[2]();
    expect(client.sendCommand).toHaveBeenCalledWith('wybierz paczke 1');
  });

  test('handleCommand ignores commands without pick', () => {
    helper['handleCommand']('foo');
    expect(client.Triggers.registerOneTimeTrigger).not.toHaveBeenCalled();
  });

  test('handleCommand registers triggers when picking package', () => {
    helper['packages'] = [{ name: 'Bob' }];
    jest.spyOn(helper as any, 'leadToPackage').mockImplementation();
    client.Triggers.registerOneTimeTrigger
      .mockReturnValueOnce('pickTrigger')
      .mockReturnValueOnce('failTrigger')
      .mockReturnValueOnce('delivery');

    helper['handleCommand']('wybierz paczke 1');

    expect(helper['pick']).toBe(1);
    expect(client.Triggers.registerOneTimeTrigger).toHaveBeenCalledTimes(2);

    const successCb = client.Triggers.registerOneTimeTrigger.mock.calls[0][1];
    successCb('', '', {} as any);

    expect(helper.leadToPackage).toHaveBeenCalledWith('Bob');
    expect(helper.currentPackage).toEqual({ name: 'Bob', time: undefined });
    expect(client.Triggers.registerOneTimeTrigger).toHaveBeenCalledTimes(3);
    expect(client.Triggers.removeTrigger).toHaveBeenCalledWith('failTrigger');
    expect(helper.deliveryTrigger).toBe('delivery');
  });

  test('handleCommand cancels pick when not trusted', () => {
    helper['packages'] = [{ name: 'Bob' }];
    client.Triggers.registerOneTimeTrigger
      .mockReturnValueOnce('pickTrigger')
      .mockReturnValueOnce('failTrigger');

    helper['handleCommand']('wybierz paczke 1');

    const failCb = client.Triggers.registerOneTimeTrigger.mock.calls[1][1];
    failCb('', '', {} as any);

    expect(client.Triggers.removeTrigger).toHaveBeenCalledWith('pickTrigger');
  });

  test('label trigger updates package status without starting timer', () => {
    helper.init();
    const trigger = client.Triggers.registerTrigger.mock.calls[0][1];
    const startSpy = jest.spyOn(helper as any, 'startTimer');
    const registerSpy = jest.spyOn(helper as any, 'registerDeliveryTrigger');
    const raw = 'Wypisano na niej duzymi literami: Bob';
    const regex = /^Wypisano na niej duzymi literami: ([a-zA-Z ']+).*$/;
    const match = raw.match(regex)!;

    const result = trigger(raw, '', match);

    expect(helper.currentPackage).toEqual({ name: 'Bob' });
    expect(client.sendEvent).toHaveBeenCalledWith('packageStatus', { recipient: 'Bob' });
    const expectedColor = colorStringInLine(raw, 'Bob', findClosestColor('#ffff00'));
    expect(result).toBe(expectedColor);
    expect(startSpy).not.toHaveBeenCalled();
    expect(registerSpy).toHaveBeenCalled();
  });

  test('label trigger does not overwrite current package when name matches', () => {
    helper.init();
    helper.currentPackage = { name: 'Bob', time: '5' } as any;
    const trigger = client.Triggers.registerTrigger.mock.calls[0][1];
    const raw = 'Wypisano na niej duzymi literami: Bob';
    const regex = /^Wypisano na niej duzymi literami: ([a-zA-Z ']+).*$/;
    const match = raw.match(regex)!;

    trigger(raw, '', match);

    expect(helper.currentPackage).toEqual({ name: 'Bob', time: '5' });
    expect(client.sendEvent).toHaveBeenCalledWith('packageStatus', { recipient: 'Bob' });
  });

  test('label trigger skips registering delivery trigger when already registered', () => {
    helper.init();
    helper.deliveryTrigger = 'exists' as any;
    const trigger = client.Triggers.registerTrigger.mock.calls[0][1];
    const spy = jest.spyOn(helper as any, 'registerDeliveryTrigger');
    const raw = 'Wypisano na niej duzymi literami: Bob';
    const regex = /^Wypisano na niej duzymi literami: ([a-zA-Z ']+).*$/;
    const match = raw.match(regex)!;

    trigger(raw, '', match);

    expect(spy).not.toHaveBeenCalled();
  });

  test('label trigger replaces current package when name differs', () => {
    helper.init();
    helper.currentPackage = { name: 'Bob', time: '5' } as any;
    const trigger = client.Triggers.registerTrigger.mock.calls[0][1];
    const raw = 'Wypisano na niej duzymi literami: Tom';
    const regex = /^Wypisano na niej duzymi literami: ([a-zA-Z ']+).*$/;
    const match = raw.match(regex)!;

    trigger(raw, '', match);

    expect(helper.currentPackage).toEqual({ name: 'Tom' });
    expect(client.sendEvent).toHaveBeenCalledWith('packageStatus', { recipient: 'Tom' });
  });

  test('packageTableCallback simplifies output when width is small', () => {
    client.contentWidth = 50;
    client.OutputHandler.makeClickable.mockImplementation(l => l);

    const cb = helper['packageTableCallback']();
    const raw =
      'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n' +
      ' |   1. Bob                     0/ 1/ 2        nieogr.\n' +
      " | * 2. Tom, Foo                1/ 2/ 3        5\n" +
      'Symbolem * oznaczono przesylki ciezkie.';

    const result = cb(raw);
    const lines = result.split('\n').map(l => l.replace(/\x1B\[[0-9;]*m/g, ''));
    expect(lines[0]).toBe('Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:');
    expect(lines[1]).toBe('1. Bob');
    expect(lines[2]).toBe('   0/1/2 nieogr.');
    expect(lines[3]).toBe('* 2. Tom, Foo');
    expect(lines[4]).toBe('   1/2/3 5 godz.');
    expect(helper['packages']).toEqual([
      { name: 'Bob', time: undefined },
      { name: 'Tom', time: '5' },
    ]);
  });

  test('packageTableCallback simplifies output on mobile when width is wide', () => {
    client.contentWidth = 100;
    client.OutputHandler.makeClickable.mockImplementation(l => l);
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { value: 'Android', configurable: true });

    const cb = helper['packageTableCallback']();
    const raw =
      'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n' +
      ' |   1. Bob                     0/ 1/ 2        nieogr.\n' +
      " | * 2. Tom, Foo                1/ 2/ 3        5\n" +
      'Symbolem * oznaczono przesylki ciezkie.';

    const result = cb(raw);
    const lines = result.split('\n').map(l => l.replace(/\x1B\[[0-9;]*m/g, ''));
    expect(lines[0]).toBe('Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:');
    expect(lines[1]).toBe('1. Bob');
    expect(lines[2]).toBe('   0/1/2 nieogr.');
    expect(lines[3]).toBe('* 2. Tom, Foo');
    expect(lines[4]).toBe('   1/2/3 5 godz.');
    expect(helper['packages']).toEqual([
      { name: 'Bob', time: undefined },
      { name: 'Tom', time: '5' },
    ]);
    Object.defineProperty(navigator, 'userAgent', { value: originalUA });
  });
});
