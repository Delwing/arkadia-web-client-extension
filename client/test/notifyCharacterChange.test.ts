import storage, { setCurrentCharacter } from '../src/storage';

describe('notifyCharacterChange', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('does not dispatch empty settings on first login', () => {
    const events: any[] = [];
    const listener = (c: any) => events.push(c);
    storage.onChanged?.addListener(listener);
    setCurrentCharacter('Hero');
    storage.onChanged?.removeListener?.(listener);
    expect(events.length).toBe(0);
  });
});
