import storage, { setCurrentCharacter, getCurrentCharacter, getItemSync, setItemSync } from '../src/storage';

describe('storage character scoping', () => {
  beforeEach(() => {
    localStorage.clear();
    setCurrentCharacter('');
  });

  test('setCurrentCharacter migrates unscoped data and notifies listeners', () => {
    localStorage.setItem('settings', JSON.stringify({ foo: 1 }));
    const listener = jest.fn();
    storage.onChanged?.addListener(listener);
    setCurrentCharacter('Alice');
    expect(localStorage.getItem('settings')).toBeNull();
    expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ foo: 1 }));
    expect(getCurrentCharacter()).toBe('Alice');
    expect(listener).toHaveBeenCalledWith({ settings: { oldValue: undefined, newValue: { foo: 1 } } });
    storage.onChanged?.removeListener(listener);
  });

  test('setItemSync stores scoped values and triggers listeners', () => {
    setCurrentCharacter('Bob');
    const listener = jest.fn();
    storage.onChanged?.addListener(listener);
    setItemSync('settings', { bar: 2 });
    expect(localStorage.getItem('Bob:settings')).toBe(JSON.stringify({ bar: 2 }));
    expect(getItemSync('settings')).toEqual({ bar: 2 });
    expect(listener).toHaveBeenCalledWith({ settings: { oldValue: undefined, newValue: { bar: 2 } } });
    storage.onChanged?.removeListener(listener);
  });
});
