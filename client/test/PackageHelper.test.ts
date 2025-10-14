import { colorStringInLine, findClosestColor } from '../src/Colors';
import appEventBus from '../src/events/app-event-bus';

const npcListeners: Array<(data: any) => void> = [];
const mockGetData = jest.fn().mockResolvedValue([]);
const mockStoreData = jest.fn().mockResolvedValue(undefined);
const mockAddListener = jest.fn(
  (listener: (data: any) => void) => {
    npcListeners.push(listener);
    return () => {
      const index = npcListeners.indexOf(listener);
      if (index !== -1) {
        npcListeners.splice(index, 1);
      }
    };
  },
);

const npcStore = {
  getData: mockGetData,
  addListener: mockAddListener,
  storeData: mockStoreData,
};

const mockGetNpcStore = jest.fn(() => npcStore);

jest.mock('../src/dataCatalog/catalogInstance', () => ({
  __esModule: true,
  dataCatalog: {
    getNpcStore: mockGetNpcStore,
  },
}));

import PackageHelper from '../src/PackageHelper';

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('PackageHelper', () => {
  let helper: any;
  let client: any;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    npcListeners.length = 0;
    mockGetData.mockReset();
    mockStoreData.mockReset();
    mockAddListener.mockReset();
    mockGetNpcStore.mockReset();
    mockGetData.mockResolvedValue([]);
    mockStoreData.mockResolvedValue(undefined);
    mockAddListener.mockImplementation((listener: (data: any) => void) => {
      npcListeners.push(listener);
      return () => {
        const index = npcListeners.indexOf(listener);
        if (index !== -1) {
          npcListeners.splice(index, 1);
        }
      };
    });
    mockGetNpcStore.mockImplementation(() => npcStore);

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
      Map: {
        currentRoom: { id: 123 },
        findPath: jest.fn((from: number, to: number) => {
          if (from === to) {
            return [from];
          }
          return [from, to];
        }),
      },
      port: { postMessage: jest.fn() },
      FunctionalBind: { set: jest.fn(), clear: jest.fn(), newMessage: jest.fn() },
      sendCommand: jest.fn(),
    };
    helper = new PackageHelper(client);
    client.Triggers.registerTrigger.mockClear();
    client.Triggers.registerMultilineTrigger.mockClear();
    client.Triggers.registerOneTimeTrigger.mockClear();
    emitSpy = jest.spyOn(appEventBus, 'emit');
  });

  afterEach(() => {
    emitSpy.mockRestore();
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
      Map: { currentRoom: { id: 1 }, findPath: jest.fn() },
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
    client.OutputHandler.makeClickable.mockImplementation(line => line);

    const rawLine = " |   1. Bob                     1/ 2/ 3        5           |";
    const packageLineRegex = /^ \|\s*(?<heavy>\*)?\s*(?<number>\d+)\. (?<name>.*?)(?:, (?<city>[\w' ]+?))?\s+(?<gold>\d+)\/\s?(?<silver>\d+)\/\s?(?<copper>\d+)\s+(?:nieogr\.|(?<time>\d+))/;
    const match = rawLine.match(packageLineRegex)!;
    const result = cb(rawLine, '', match);

    const stripped = result.replace(/\x1B\[[0-9;]*m/g, '');
    expect(stripped).toContain('dystans: --');
    expect(stripped.trimEnd().endsWith('|')).toBe(true);
    expect(helper['packages']).toEqual([{ name: 'Bob', time: '5', distance: undefined }]);
    expect(client.OutputHandler.makeClickable).toHaveBeenCalledTimes(1);
    const call = client.OutputHandler.makeClickable.mock.calls[0];
    const expectedColor = colorStringInLine(stripped, 'Bob', findClosestColor('#aaaaaa'));
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

  test('registerDeliveryTrigger persists newly discovered NPCs', async () => {
    mockGetData.mockClear();
    mockStoreData.mockClear();
    helper.currentPackage = { name: 'Nowy Odbiorca' } as any;
    helper.npc = {};

    helper['registerDeliveryTrigger']();
    const deliveryCb = client.Triggers.registerOneTimeTrigger.mock.calls[0][1];

    await deliveryCb('', '', ['','Oddajesz'] as any);
    await flushPromises();

    expect(mockGetData).toHaveBeenCalledTimes(1);
    expect(mockStoreData).toHaveBeenCalledWith([
      { name: 'Nowy Odbiorca', loc: 123, custom: true },
    ]);
    expect(helper.npc['Nowy Odbiorca']).toBe(123);
    expect(client.println).toHaveBeenCalledWith('Nowy adresat: Nowy Odbiorca | 123');
  });

  test('registerDeliveryTrigger skips persistence for known NPCs', async () => {
    mockGetData.mockClear();
    mockStoreData.mockClear();
    helper.currentPackage = { name: 'Znany Odbiorca' } as any;
    helper.npc = {};
    mockGetData.mockResolvedValueOnce([
      { name: 'Znany Odbiorca', loc: 123, custom: true },
    ]);

    helper['registerDeliveryTrigger']();
    const deliveryCb = client.Triggers.registerOneTimeTrigger.mock.calls[0][1];

    await deliveryCb('', '', ['','Oddajesz'] as any);
    await flushPromises();

    expect(mockStoreData).not.toHaveBeenCalled();
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
    expect(emitSpy).toHaveBeenCalledWith('packageStatus', { recipient: 'Bob' });
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
    expect(emitSpy).toHaveBeenCalledWith('packageStatus', { recipient: 'Bob' });
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
    expect(emitSpy).toHaveBeenCalledWith('packageStatus', { recipient: 'Tom' });
  });

  test('packageTableCallback simplifies output when width is small', () => {
    client.contentWidth = 50;
    client.OutputHandler.makeClickable.mockImplementation(l => l);

    helper.npc['Bob'] = 123;
    helper.npc['Tom'] = 456;
    const cb = helper['packageTableCallback']();
    const raw =
      'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n' +
      ' |   1. Bob                     0/ 1/ 2        nieogr.      |\n' +
      " | * 2. Tom, Foo                1/ 2/ 3        5           |\n" +
      'Symbolem * oznaczono przesylki ciezkie.';

    const result = cb(raw);
    const lines = result.split('\n').map(l => l.replace(/\x1B\[[0-9;]*m/g, ''));
    expect(lines[0]).toBe('Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('  1. Bob');
    expect(lines[3]).toBe('   0/1/2 nieogr. dystans: 0');
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('* 2. Tom, Foo');
    expect(lines[6]).toBe('   1/2/3 5 godz. dystans: 1');
    expect(helper['packages']).toEqual([
      { name: 'Bob', time: undefined, distance: 0 },
      { name: 'Tom', time: '5', distance: 1 },
    ]);
  });

  test('packageTableCallback simplifies output on mobile when width is wide', () => {
    client.contentWidth = 100;
    client.OutputHandler.makeClickable.mockImplementation(l => l);
    const originalUA = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { value: 'Android', configurable: true });

    helper.npc['Bob'] = 123;
    helper.npc['Tom'] = 456;
    const cb = helper['packageTableCallback']();
    const raw =
      'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n' +
      ' |   1. Bob                     0/ 1/ 2        nieogr.      |\n' +
      " | * 2. Tom, Foo                1/ 2/ 3        5           |\n" +
      'Symbolem * oznaczono przesylki ciezkie.';

    const result = cb(raw);
    const lines = result.split('\n').map(l => l.replace(/\x1B\[[0-9;]*m/g, ''));
    expect(lines[0]).toBe('Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('  1. Bob');
    expect(lines[3]).toBe('   0/1/2 nieogr. dystans: 0');
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('* 2. Tom, Foo');
    expect(lines[6]).toBe('   1/2/3 5 godz. dystans: 1');
    expect(helper['packages']).toEqual([
      { name: 'Bob', time: undefined, distance: 0 },
      { name: 'Tom', time: '5', distance: 1 },
    ]);
    Object.defineProperty(navigator, 'userAgent', { value: originalUA });
  });

  test('packageTableCallback extends standard table with distance column', () => {
    client.contentWidth = 120;
    client.OutputHandler.makeClickable.mockImplementation(l => l);

    helper.npc['Borgaf Kriegmann'] = 123;
    helper.npc['Georg Blaskovitz'] = 456;
    const cb = helper['packageTableCallback']();
    const raw =
      'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n' +
      ' o============================================================================o\n' +
      ' |                Adresat badz                     Cena          Czas na      |\n' +
      ' |               urzad pocztowy                  zl/sr/md      dostarczenie   |\n' +
      ' o -------------------------------------------------------------------------- o\n' +
      ' |   1. Borgaf Kriegmann                          0/ 4/ 2        nieogr.      |\n' +
      " | * 2. Georg Blaskovitz                        0/ 5/ 0        8 godzin     |\n" +
      ' o -------------------------------------------------------------------------- o\n' +
      ' |      Symbolem * oznaczono przesylki ciezkie.                               |\n' +
      ' o============================================================================o';

    const result = cb(raw);
    const lines = result.split('\n').map(l => l.replace(/\x1B\[[0-9;]*m/g, ''));

    expect(lines[0]).toBe('Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:');
    const rawBorderLength = ' o============================================================================o'.length;
    const topBorder = lines.find(line => /^ o=+o$/.test(line));
    const bottomBorder = [...lines].reverse().find(line => /^ o=+o$/.test(line));
    const header = lines.find(line => line.includes('Adresat badz'));
    const subHeader = lines.find(line => line.includes('urzad pocztowy'));
    const separators = lines.filter(line => /^ o -+ o$/.test(line));
    const firstRow = lines.find(line => line.includes('1. Borgaf Kriegmann'));
    const secondRow = lines.find(line => line.includes('2. Georg Blaskovitz'));
    const footer = lines.find(line => line.includes('Symbolem * oznaczono przesylki ciezkie.'));

    expect(topBorder).toBeDefined();
    expect(bottomBorder).toBeDefined();
    expect(header).toBeDefined();
    expect(subHeader).toBeDefined();
    expect(firstRow).toBeDefined();
    expect(secondRow).toBeDefined();
    expect(footer).toBeDefined();
    expect(separators.length).toBeGreaterThanOrEqual(2);
    expect(topBorder!.length).toBe(rawBorderLength + 16);
    expect(bottomBorder!.length).toBe(rawBorderLength + 16);
    expect(header).toContain('Dystans');
    expect(subHeader).toContain('w krokach');
    expect(firstRow).toContain('dystans: 0');
    expect(secondRow).toContain('dystans: 1');
    expect(firstRow!.trimEnd().endsWith('|')).toBe(true);
    expect(secondRow!.trimEnd().endsWith('|')).toBe(true);
    expect(footer!.trimEnd().endsWith('|')).toBe(true);

    expect(helper['packages']).toEqual([
      { name: 'Borgaf Kriegmann', time: undefined, distance: 0 },
      { name: 'Georg Blaskovitz', time: '8', distance: 1 },
    ]);
  });

  test('packageTableCallback keeps custom borders aligned', () => {
    client.contentWidth = 140;
    client.OutputHandler.makeClickable.mockImplementation(l => l);
    helper.npc['Borgaf Kriegmann'] = 123;

    const cb = helper['packageTableCallback']();
    const raw =
      'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:\n' +
      ' o============================================================================o\n' +
      ' |                Adresat badz                     Cena          Czas na      |\n' +
      ' |               urzad pocztowy                  zl/sr/md      dostarczenie   |\n' +
      ' o -------------------------------------------------------------------------- o\n' +
      ' |   1. Borgaf Kriegmann                          0/ 4/ 2        nieogr.      |\n' +
      ' o -------------------------------------------------------------------------- o\n' +
      'Symbolem * oznaczono przesylki ciezkie.';

    const result = cb(raw);
    const lines = result.split('\n').map(l => l.replace(/\x1B\[[0-9;]*m/g, ''));

    const topBorder = lines[1];
    const header = lines[2];
    const separator = lines[4];
    const row = lines[5];

    expect(topBorder.length).toBe(row.length);
    expect(header.length).toBe(row.length);
    expect(separator.length).toBe(row.length);
    expect(row).toContain('dystans: 0');
  });
});
