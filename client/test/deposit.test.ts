jest.mock('../src/scripts/prettyContainers', () => {
  const actual = jest.requireActual('../src/scripts/prettyContainers');
  return { ...actual, prettyPrintContainer: jest.fn(() => 'table') };
});

import initDeposits, { deposits } from '../src/scripts/deposits';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { prettyPrintContainer } from '../src/scripts/prettyContainers';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  private storageListeners: Record<string, Set<(value: any) => void>> = {};
  Triggers = new Triggers(({} as unknown) as any);
  Map = { currentRoom: { id: 1, name: 'Bank', userData: { bind: '/depozyt' } } } as any;
  println = jest.fn();
  print = jest.fn();
  storeData: Record<string, any> = {};
  store = {
    setStorageItem: jest.fn(async (key: string, value: any) => {
      this.storeData[key] = value;
      this.emitStorage(key, value);
    }),
    getStorageItem: jest.fn(async (key: string) => this.storeData[key]),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    updateUiSettings: jest.fn().mockResolvedValue(undefined),
    getSettingsSnapshot: jest.fn(() => ({} as any)),
    updateHerbCounts: jest.fn().mockResolvedValue(undefined),
    subscribeStorage: jest.fn((key: string, cb: (value: any) => void) => {
      if (!this.storageListeners[key]) {
        this.storageListeners[key] = new Set();
      }
      this.storageListeners[key].add(cb);
      return () => {
        this.storageListeners[key].delete(cb);
      };
    }),
  } as any;
  sendCommand = jest.fn();
  contentWidth = 80;

  emitStorage(key: string, value: any) {
    this.storeData[key] = value;
    const listeners = this.storageListeners[key];
    if (listeners) {
      listeners.forEach((cb) => {
        Promise.resolve().then(() => cb(value));
      });
    }
  }

  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  removeEventListener(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  dispatch(event: string, detail: any) {
    this.emitter.emit(event, { detail });
  }
}

describe('deposits', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let refresh: () => void;
  let show: () => void;
  let reset: () => void;

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initDeposits((client as unknown) as any, aliases);
    client.emitStorage('deposits', {});
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    refresh = aliases[0].callback;
    show = aliases[1].callback;
    reset = aliases[2].callback;
    Object.keys(deposits).forEach(k => delete deposits[parseInt(k)]);
    jest.clearAllMocks();
  });

  test('refresh command sends query', () => {
    refresh();
    expect(client.sendCommand).toHaveBeenCalledWith('przejrzyj depozyt');
  });

  test('parses deposit contents', () => {
    parse('Twoj depozyt zawiera miecz, tarcza.');
    expect(deposits[1].items).toEqual([
      { count: 1, name: 'miecz' },
      { count: 1, name: 'tarcza' }
    ]);
  });

  test('handles empty deposit', () => {
    parse('Twoj depozyt jest pusty.');
    expect(deposits[1].items).toEqual([]);
  });

  test('handles no deposit', () => {
    parse('Nie posiadasz wykupionego depozytu.');
    expect(deposits[1].items).toBeNull();
  });

  test('prints deposits', () => {
    parse('Twoj depozyt zawiera miecz.');
    show();
    const printed = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(printed).toContain('  1 | miecz');
  });

  test('parses Polish numbers in deposits', () => {
    parse('Twoj depozyt zawiera dwa miecze, piec tarcz, dziesiec monet.');
    expect(deposits[1].items).toEqual([
      { count: 2, name: 'miecze' },
      { count: 5, name: 'tarcz' },
      { count: 10, name: 'monet' }
    ]);
  });

  test('parses Polish compound numbers in deposits', () => {
    parse('Twoj depozyt zawiera dwadziescia jeden miecz, trzydziesci dwa topory, piecdziesiat tarcz.');
    expect(deposits[1].items).toEqual([
      { count: 21, name: 'miecz' },
      { count: 32, name: 'topory' },
      { count: 50, name: 'tarcz' }
    ]);
  });

  test('parses "wiele" as special case in deposits', () => {
    parse('Twoj depozyt zawiera wiele monet, trzy klejnoty.');
    expect(deposits[1].items).toEqual([
      { count: 'wie', name: 'monet' },
      { count: 3, name: 'klejnoty' }
    ]);
  });

  test('parses numeric digits in deposits', () => {
    parse('Twoj depozyt zawiera 25 monet, 100 klejnotow.');
    expect(deposits[1].items).toEqual([
      { count: 25, name: 'monet' },
      { count: 100, name: 'klejnotow' }
    ]);
  });

  test('prints deposits with Polish number counts', () => {
    parse('Twoj depozyt zawiera piec mieczy, wiele monet.');
    show();
    const printed = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(printed).toContain('  5 | mieczy');
    expect(printed).toContain('wie | monet');
  });

  test('reset command clears deposits and persists', () => {
    parse('Twoj depozyt zawiera miecz.');
    expect(deposits[1]).toBeDefined();

    reset();

    expect(deposits[1]).toBeUndefined();
    expect(client.store.setStorageItem).toHaveBeenLastCalledWith('deposits', {});
    expect(client.println).toHaveBeenCalledWith('Zapisane depozyty zostaly usuniete.');
  });

  test('uses column setting for pretty print', () => {
    client.dispatch('settings', { containerColumns: 3 });
    parse('Twoj depozyt zawiera miecz.');
    expect(prettyPrintContainer).toHaveBeenCalledWith(expect.anything(), 3, 'DEPOZYT', 5, client.contentWidth);
  });

  test('replaces stored deposits when storage updates', async () => {
    parse('Twoj depozyt zawiera miecz.');
    expect(deposits[1]?.items).toEqual([
      { count: 1, name: 'miecz' }
    ]);

    client.emitStorage('deposits', {
      2: { name: 'Inny bank', items: [{ count: 3, name: 'klejnoty' }] }
    });
    await Promise.resolve();

    expect(deposits[1]).toBeUndefined();
    expect(deposits[2]).toEqual({
      name: 'Inny bank',
      items: [{ count: 3, name: 'klejnoty' }]
    });
  });
});
