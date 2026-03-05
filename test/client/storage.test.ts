import { characterStorage } from '@modules/core/storage';

describe('storage character scoping', () => {
  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('');
  });

  test('setCharacter migrates unscoped data and notifies listeners', () => {
    localStorage.setItem('settings', JSON.stringify({ foo: 1 }));
    const listener = jest.fn();
    characterStorage.onChange('settings', listener);
    characterStorage.setCharacter('Alice');
    expect(localStorage.getItem('settings')).toBeNull();
    expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ foo: 1 }));
    expect(characterStorage.getCharacter()).toBe('Alice');
    expect(listener).toHaveBeenCalledWith({ foo: 1 }, undefined);
  });

  test('set stores scoped values and triggers listeners', () => {
    characterStorage.setCharacter('Bob');
    const listener = jest.fn();
    characterStorage.onChange('settings', listener);
    characterStorage.set('settings', { bar: 2 } as any);
    expect(localStorage.getItem('Bob:settings')).toBe(JSON.stringify({ bar: 2 }));
    expect(characterStorage.get('settings')).toEqual({ bar: 2 });
    expect(listener).toHaveBeenCalledWith({ bar: 2 }, undefined);
  });
});
