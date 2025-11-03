import initCompareAll, { formatComparisonTable } from '@client/scripts/compareAll';
import Triggers, { stripAnsiCodes } from '@client/Triggers';

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
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
    initCompareAll((client as unknown) as any, aliases);
    compareAll = aliases[0].callback as any;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('sends comparison commands for each target', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { num: 1, shortcut: '1' },
      { num: 2, shortcut: '2' },
    ]);
    compareAll([''] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('porownaj sile z ob_1', false);
    expect(client.sendCommand).toHaveBeenCalledWith('porownaj zrecznosc z ob_1', false);
    expect(client.sendCommand).toHaveBeenCalledWith('porownaj wytrzymalosc z ob_1', false);
    expect(client.sendCommand).toHaveBeenCalledWith('porownaj sile z ob_2', false);
    jest.runAllTimers();
  });

  test('prints formatted table with results', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([{ num: 3, shortcut: '1' }]);
    compareAll([''] as unknown as RegExpMatchArray);
    parse('Wydaje ci sie, ze jestes silniejszy niz Goblin.');
    parse('Wydaje ci sie, ze jestes zreczniejszy niz Goblin.');
    parse('Wydaje ci sie, ze jestes lepiej zbudowany niz Goblin.');
    jest.runAllTimers();
    const printed = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(printed).toMatch(/Goblin/);
    expect(printed).toMatch(/-3/);
  });

  test('sends comparison commands for shortcut', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { num: 5, shortcut: '1' },
      { num: 6, shortcut: '2' },
    ]);
    compareAll(['', '2'] as unknown as RegExpMatchArray);
    expect(client.sendCommand).toHaveBeenCalledWith('porownaj sile z ob_6', false);
    expect(client.sendCommand).toHaveBeenCalledWith('porownaj zrecznosc z ob_6', false);
    expect(client.sendCommand).toHaveBeenCalledWith('porownaj wytrzymalosc z ob_6', false);
  });

  test('formats header wide enough for long descriptions', () => {
    const longName = 'przygarbiony wyszczerzony ork';
    const table = formatComparisonTable({ [longName]: { sil: -1, zre: -1, wyt: -2 } });
    const [header, underline, row] = table.split('\n');
    expect(row).toContain(longName);
    expect(underline.length).toBe(header.length);
    expect(row.length).toBe(header.length);
  });
});
