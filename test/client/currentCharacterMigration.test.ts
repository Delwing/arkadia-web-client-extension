import { setCurrentCharacter } from '@modules/core/storage';

describe('setCurrentCharacter migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('moves unscoped settings to first character', () => {
    localStorage.setItem('settings', JSON.stringify({ a: 1 }));
    setCurrentCharacter('Hero');
    expect(localStorage.getItem('Hero:settings')).toBe(JSON.stringify({ a: 1 }));
    expect(localStorage.getItem('settings')).toBeNull();
    expect(localStorage.getItem('currentCharacter')).toBe('Hero');
  });
});
