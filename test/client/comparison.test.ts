import initCompareAll, { formatComparisonTable } from '@client/scripts/compareAll';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  ObjectManager = {
    getObjectsOnLocation: jest.fn(() => []),
  };
  Triggers = new Triggers(({} as unknown) as any);
  sendCommand = jest.fn();
  print = jest.fn();
  println = jest.fn();
}

describe('compare all alias', () => {
  let client: FakeClient;
  let compareAll: (m: RegExpMatchArray) => void;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
    initCompareAll((client as unknown) as any, aliases);
    compareAll = aliases[0].callback as any;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('sends ocen commands for each target', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { num: 1, shortcut: '1' },
      { num: 2, shortcut: '2' },
    ]);
    compareAll([''] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('ocen ob_1', false);
    expect(client.sendCommand).toHaveBeenCalledWith('ocen ob_2', false);
    jest.runAllTimers();
  });

  test('prints formatted table with results', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 3, shortcut: '1' }]);
    compareAll([''] as unknown as RegExpMatchArray);
    parse('Wydaje ci sie, ze jestes silniejszy, zreczniejszy i lepiej zbudowany niz Goblin.');
    jest.runAllTimers();
    const printed = typeof client.println.mock.calls[0][0] === 'string' ? client.println.mock.calls[0][0] : client.println.mock.calls[0][0]?.text;
    expect(printed).toMatch(/Goblin/);
    expect(printed).toMatch(/-3/);
  });

  test('sends ocen command for shortcut', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { num: 5, shortcut: '1' },
      { num: 6, shortcut: '2' },
    ]);
    compareAll(['', '2'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('ocen ob_6', false);
  });

  test('formats header wide enough for long descriptions', () => {
    const longName = 'przygarbiony wyszczerzony ork';
    const results = new Map();
    results.set(longName, {
      stats: { sil: -1, zre: -1, wyt: -2 },
      buffer: new AnsiAwareBuffer(longName)
    });
    const table = formatComparisonTable(results);
    const [header, underline, row] = table.text.split('\n');
    expect(row).toContain(longName);
    expect(underline.length).toBe(header.length);
    expect(row.length).toBe(header.length);
  });

  test('handles new single-line format with all stats', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 1, shortcut: '1' }]);
    compareAll([''] as unknown as RegExpMatchArray);
    parse('Wydaje ci sie, ze jestes duzo silniejszy, duzo lepiej zbudowany i zreczniejszy niz korpulentny rumiany halfling.');
    jest.runAllTimers();
    expect(client.println).toHaveBeenCalled();
    const printed = typeof client.println.mock.calls[0][0] === 'string' ? client.println.mock.calls[0][0] : client.println.mock.calls[0][0]?.text;
    expect(printed).toContain('korpulentny rumiany halfling');
    // Note: -5 for "duzo silniejszy", "duzo lepiej zbudowany", "zreczniejszy" (without modifier is -3)
    // So total should be -5 + -5 + -3 = -13
  });

  test('handles new single-line format with mixed levels', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 2, shortcut: '1' }]);
    compareAll([''] as unknown as RegExpMatchArray);
    parse('Wydaje ci sie, ze jestes znacznie silniejszy, troche lepiej zbudowany i zreczniejszy niz wysoki elf.');
    jest.runAllTimers();
    const printed = typeof client.println.mock.calls[0][0] === 'string' ? client.println.mock.calls[0][0] : client.println.mock.calls[0][0]?.text;
    expect(printed).toMatch(/wysoki elf/);
    expect(printed).toMatch(/-4/); // znacznie silniejszy = -4
    expect(printed).toMatch(/-2/); // troche lepiej zbudowany = -2
    expect(printed).toMatch(/-3/); // zreczniejszy = -3
  });
});
