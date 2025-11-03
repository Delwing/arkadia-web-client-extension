import initWeaponColors, { WEAPON_COLOR } from '@client/scripts/weaponColors';
import Triggers, { stripAnsiCodes } from '@client/Triggers';
import { colorStringInLine, color, RESET } from '@modules/core/Colors';
import { MAGICS_COLOR } from '@client/scripts/magics';

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
    const expected = colorStringInLine(line, 'stalowy miecz', WEAPON_COLOR).toAnsiString();
    expect(stripAnsiCodes(result)).toBe(line);
    expect(result).toBe(expected);
  });

  test('colors two weapons', () => {
    const line = 'Trzymasz stalowy miecz w lewej rece oraz drewniana tarcze w prawej rece.';
    let expectedLine = colorStringInLine(line, 'stalowy miecz', WEAPON_COLOR);
    expectedLine = colorStringInLine(expectedLine, 'drewniana tarcze', WEAPON_COLOR);
    const expected = expectedLine.toAnsiString();
    const result = parse(line);
    expect(stripAnsiCodes(result)).toBe(stripAnsiCodes(expected));
    expect(result).toBe(expected);
  });

  test('colors identical weapons in both hands', () => {
    const line = 'Trzymasz zebaty szeroki noz bojowy w lewej rece oraz zebaty szeroki noz bojowy w prawej rece.';
    const weapon = 'zebaty szeroki noz bojowy';
    const firstIndex = line.indexOf(weapon);
    const secondIndex = line.indexOf(weapon, firstIndex + weapon.length);
    let expectedLine = colorStringInLine(line, weapon, WEAPON_COLOR, secondIndex);
    expectedLine = colorStringInLine(expectedLine, weapon, WEAPON_COLOR, firstIndex);
    const expected = expectedLine.toAnsiString();
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
    let expectedLine = colorStringInLine(precolored, 'drewniana tarcze', WEAPON_COLOR);
    const expected = expectedLine.toAnsiString();
    const result = parse(precolored);
    expect(stripAnsiCodes(result)).toBe(stripAnsiCodes(expected));
    expect(result).toBe(expected);
  });

  test('colors weapon in scabbard', () => {
    const line = 'Masz do pasa przypieta pochwe, zawierajaca stalowy miecz.';
    const result = parse(line);
    const expected = colorStringInLine(line, 'stalowy miecz', WEAPON_COLOR).toAnsiString();
    expect(stripAnsiCodes(result)).toBe(line);
    expect(result).toBe(expected);
  });

  test('colors weapon stuck in scabbard', () => {
    const line = 'Masz do pasa przypieta pochwe z tkwiacym w niej stalowym mieczem.';
    const result = parse(line);
    const expected = colorStringInLine(line, 'stalowym mieczem', WEAPON_COLOR).toAnsiString();
    expect(stripAnsiCodes(result)).toBe(line);
    expect(result).toBe(expected);
  });
});
