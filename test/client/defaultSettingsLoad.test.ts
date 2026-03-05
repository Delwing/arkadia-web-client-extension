import { characterStorage } from '@modules/core/storage';
import { defaultSettings } from '@modules/core/defaultSettings';

describe('default settings loading', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns undefined when no settings stored (defaults applied at read-time by consumers)', () => {
    expect(characterStorage.get('settings')).toBeUndefined();
  });

  test('returns stored settings when present', () => {
    characterStorage.setCharacter('Alice');
    characterStorage.set('settings', { ...defaultSettings, shortenExits: true });
    expect(characterStorage.get('settings')).toEqual({ ...defaultSettings, shortenExits: true });
  });
});
