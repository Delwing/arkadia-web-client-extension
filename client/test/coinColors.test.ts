import initCoinColors from '../src/scripts/coinColors';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { colorStringInLine } from '../src/Colors';
import { GOLD_COLOR, SILVER_COLOR, COPPER_COLOR } from '../src/scripts/shop';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('coin colors trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initCoinColors((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('colors coins in receive sentence', () => {
    const line = 'Otrzymujesz 11 zlotych, 15 srebrnych i 8 miedzianych monet.';
    let expected = colorStringInLine(line, '11 zlotych', GOLD_COLOR);
    expected = colorStringInLine(expected, '15 srebrnych', SILVER_COLOR);
    expected = colorStringInLine(expected, '8 miedzianych monet', COPPER_COLOR);
    const result = parse(line);
    expect(stripAnsiCodes(result)).toBe(stripAnsiCodes(expected));
    expect(result).toBe(expected);
  });
});
