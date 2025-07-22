import initWeaponColors, { WEAPON_COLOR } from '../src/scripts/weaponColors';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { colorStringInLine } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('weapon colors trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initWeaponColors((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('colors single weapon', () => {
    const line = 'Trzymasz oburacz stalowy miecz.';
    const result = parse(line);
    const expected = colorStringInLine(line, 'stalowy miecz', WEAPON_COLOR);
    expect(stripAnsiCodes(result)).toBe(line);
    expect(result).toBe(expected);
  });

  test('colors two weapons', () => {
    const line = 'Trzymasz stalowy miecz w lewej rece oraz drewniana tarcze w prawej rece.';
    let expected = colorStringInLine(line, 'stalowy miecz', WEAPON_COLOR);
    expected = colorStringInLine(expected, 'drewniana tarcze', WEAPON_COLOR);
    const result = parse(line);
    expect(stripAnsiCodes(result)).toBe(stripAnsiCodes(expected));
    expect(result).toBe(expected);
  });
});
