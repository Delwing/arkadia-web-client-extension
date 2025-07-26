import { setCurrentCharacter } from '../src/storage';

describe('binds migration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('moves binds from character settings to global storage', () => {
    localStorage.setItem('Hero:settings', JSON.stringify({ binds: { main: { key: 'KeyX' } } }));
    setCurrentCharacter('Hero');
    expect(localStorage.getItem('binds')).toBe(JSON.stringify({ main: { key: 'KeyX' } }));
    const stored = localStorage.getItem('Hero:settings');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored as string);
    expect(parsed.binds).toBeUndefined();
  });
});
