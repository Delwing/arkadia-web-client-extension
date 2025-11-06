import initCoinColors from '@client/scripts/coinColors';
import Triggers, { stripAnsiCodes } from '@client/Triggers';
import { colorStringInLine } from '@modules/core/Colors';
import { GOLD_COLOR, SILVER_COLOR, COPPER_COLOR } from '@client/constants/colors';

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
    const result = parse(line);
    const gold = colorStringInLine('11 zlotych', '11 zlotych', GOLD_COLOR).toAnsiString();
    const silver = colorStringInLine('15 srebrnych', '15 srebrnych', SILVER_COLOR).toAnsiString();
    const copper = colorStringInLine('8 miedzianych', '8 miedzianych', COPPER_COLOR).toAnsiString();
    expect(result).toContain(gold);
    expect(result).toContain(silver);
    expect(result).toContain(copper);
    expect(stripAnsiCodes(result)).toBe(line);
  });

  test('does not color words without following monety', () => {
    const line = 'Masz 10 srebrnych monet i zlote.';
    const result = parse(line);
    const silver = colorStringInLine('10 srebrnych', '10 srebrnych', SILVER_COLOR).toAnsiString();
    const gold = colorStringInLine('zlote', 'zlote', GOLD_COLOR).toAnsiString();
    expect(result).toContain(silver);
    expect(result).toContain(' i zlote.');
    expect(result).not.toContain(gold);
    expect(stripAnsiCodes(result)).toBe(line);
  });
});
