import { DEFAULT_DRAW_WEAPON_COMMAND, normalizeDrawWeaponCommand } from '../src/utils/drawWeaponCommand';

describe('normalizeDrawWeaponCommand', () => {
  test('returns default when value is not a string', () => {
    expect(normalizeDrawWeaponCommand(undefined)).toBe(DEFAULT_DRAW_WEAPON_COMMAND);
  });

  test('returns trimmed command', () => {
    expect(normalizeDrawWeaponCommand('  dobadz  ')).toBe('dobadz');
  });

  test('strips "wszystkich broni" suffix', () => {
    expect(normalizeDrawWeaponCommand('  dobadz wszystkich broni  ')).toBe('dobadz');
  });

  test('strips suffix regardless of spacing or case', () => {
    expect(normalizeDrawWeaponCommand('DOBADZ   WSZYSTKICH BRONI')).toBe('DOBADZ');
  });

  test('returns default when command is empty after trimming', () => {
    expect(normalizeDrawWeaponCommand('   ')).toBe(DEFAULT_DRAW_WEAPON_COMMAND);
  });
});
