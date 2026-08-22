vi.mock('@client/scripts/prettyContainers', async () => {
  const actual = await vi.importActual<typeof import('@client/scripts/prettyContainers')>('@client/scripts/prettyContainers');
  return { ...actual, prettyPrintContainer: jest.fn(() => 'table') };
});

import initDeposits, { deposits } from '@client/scripts/deposits';
import Triggers from '@client/Triggers';
import { prettyPrintContainer } from '@client/scripts/prettyContainers';
import { EventEmitter } from 'events';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from './helpers/testSettings';
import { FakeClientBase } from './helpers/fakeClient';

class FakeClient extends FakeClientBase {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  Map = { currentRoom: { id: 1, name: 'Bank', userData: { bind: '/depozyt' } } } as any;
  println = jest.fn();
  print = jest.fn();
  sendCommand = jest.fn();
  contentWidth = 80;

  on(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
  off(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  dispatch(event: string, detail: any) {
    this.emitter.emit(event, detail);
  }
}

describe('deposits', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  let refresh: () => void;
  let show: () => void;
  let reset: () => void;

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initDeposits((client as unknown) as any, aliases);
    characterStorage.set('deposits', {});
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    refresh = aliases[0].callback;
    show = aliases[1].callback;
    reset = aliases[2].callback;
    Object.keys(deposits).forEach(k => delete deposits[parseInt(k)]);
    jest.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
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
    const printed = client.println.mock.calls[0][0]?.text;
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
    const printed = client.println.mock.calls[0][0]?.text;
    expect(printed).toContain('  5 | mieczy');
    expect(printed).toContain('wie | monet');
  });

  test('reset command clears deposits and persists', () => {
    parse('Twoj depozyt zawiera miecz.');
    expect(deposits[1]).toBeDefined();

    reset();

    expect(deposits[1]).toBeUndefined();
    expect(characterStorage.get('deposits')).toEqual({});
    expect(client.println).toHaveBeenCalledWith('Zapisane depozyty zostaly usuniete.');
  });

  test('uses column setting for pretty print', () => {
    setTestSettings({ containerColumns: 3 });
    parse('Twoj depozyt zawiera miecz.');
    expect(prettyPrintContainer).toHaveBeenCalledWith(expect.anything(), 3, 'DEPOZYT', 5, client.contentWidth);
  });

  test('replaces stored deposits when storage updates', () => {
    parse('Twoj depozyt zawiera miecz.');
    expect(deposits[1]?.items).toEqual([
      { count: 1, name: 'miecz' }
    ]);

    characterStorage.set('deposits', {
      2: { name: 'Inny bank', items: [{ count: 3, name: 'klejnoty' }] }
    });

    expect(deposits[1]).toBeUndefined();
    expect(deposits[2]).toEqual({
      name: 'Inny bank',
      items: [{ count: 3, name: 'klejnoty' }]
    });
  });

  test('keeps deposit data when storage event reuses same object reference', () => {
    parse('Twoj depozyt zawiera miecz.');
    const storedReference = deposits as Record<number, any>;

    characterStorage.set('deposits', storedReference);

    expect(deposits[1]).toEqual({
      name: 'Bank',
      items: [{ count: 1, name: 'miecz' }],
    });
  });
});
