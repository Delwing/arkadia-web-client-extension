import initWeaponColors, { WEAPON_COLOR } from '../src/scripts/weaponColors';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { colorStringInLine, color, RESET } from '../src/Colors';
import { MAGICS_COLOR } from '../src/scripts/magics';

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

  test('keeps magic color for single weapon', () => {
    const line = 'Trzymasz oburacz stalowy miecz.';
    const magicColored = color(MAGICS_COLOR) + 'stalowy miecz' + RESET;
    const precolored = line.replace('stalowy miecz', magicColored);
    const result = parse(precolored);
    expect(result).toBe(precolored);
  });

  test('keeps magic color for one of two weapons', () => {
    const line = 'Trzymasz stalowy miecz w lewej rece oraz drewniana tarcze w prawej rece.';
    const magicColoredWeapon = color(MAGICS_COLOR) + 'stalowy miecz' + RESET;
    const precolored = line.replace('stalowy miecz', magicColoredWeapon);
    let expected = precolored;
    expected = colorStringInLine(expected, 'drewniana tarcze', WEAPON_COLOR);
    const result = parse(precolored);
    expect(stripAnsiCodes(result)).toBe(stripAnsiCodes(expected));
    expect(result).toBe(expected);
  });
});
