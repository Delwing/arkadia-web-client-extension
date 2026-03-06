import { characterStorage } from '@modules/core/storage';

describe('notifyCharacterChange', () => {
  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('');
  });

  test('does not fire onChange for settings on first login when no data exists', () => {
    const listener = jest.fn();
    characterStorage.onChange('settings', listener);
    characterStorage.setCharacter('Hero');
    // No stored settings for Hero, but settings has notifyOnNull.
    // Since oldRaw === newRaw === null, it should NOT fire (oldRaw === newRaw check).
    expect(listener).not.toHaveBeenCalled();
  });

  test('onCharacterChange fires even on first login', () => {
    const listener = jest.fn();
    characterStorage.onCharacterChange(listener);
    characterStorage.setCharacter('Hero');
    expect(listener).toHaveBeenCalledWith('Hero');
  });
});
