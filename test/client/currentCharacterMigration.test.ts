import { characterStorage } from '@modules/core/storage';

describe('setCharacter migration', () => {
  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('');
  });

  test('moves unscoped settings to first character', () => {
    localStorage.setItem('settings', JSON.stringify({ a: 1 }));
    characterStorage.setCharacter('Hero');
    expect(localStorage.getItem('Hero:settings')).toBe(JSON.stringify({ a: 1 }));
    expect(localStorage.getItem('settings')).toBeNull();
    expect(localStorage.getItem('currentCharacter')).toBe('Hero');
  });
});
