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
  Triggers = new Triggers(({} as unknown) as any);
  Map = { currentRoom: { id: 1, name: 'Bank', userData: { bind: '/depozyt' } } } as any;
  println = jest.fn();
  print = jest.fn();
  port = { postMessage: jest.fn() } as any;
  sendCommand = jest.fn();
  contentWidth = 80;

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

  beforeEach(() => {
    (global as any).Input = { send: jest.fn() };
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initDeposits((client as unknown) as any, aliases);
    client.dispatch('storage', { key: 'deposits', value: {} });
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    refresh = aliases[0].callback;
    show = aliases[1].callback;
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

  test('uses column setting for pretty print', () => {
    client.dispatch('settings', { containerColumns: 3 });
    parse('Twoj depozyt zawiera miecz.');
    expect(prettyPrintContainer).toHaveBeenCalledWith(expect.anything(), 3, 'DEPOZYT', 5, client.contentWidth);
  });

  test('replaces stored deposits when storage updates', () => {
    parse('Twoj depozyt zawiera miecz.');
    expect(deposits[1]?.items).toEqual([
      { count: 1, name: 'miecz' }
    ]);

    client.dispatch('storage', {
      key: 'deposits',
      value: {
        2: { name: 'Inny bank', items: [{ count: 3, name: 'klejnoty' }] }
      }
    });

    expect(deposits[1]).toBeUndefined();
    expect(deposits[2]).toEqual({
      name: 'Inny bank',
      items: [{ count: 3, name: 'klejnoty' }]
    });
  });
});
