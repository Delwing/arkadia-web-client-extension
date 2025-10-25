import initUserTriggers, { UserTrigger } from '../src/scripts/userTriggers';
import Triggers from '../src/Triggers';
import { findClosestColor } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  playSound = jest.fn();
  sendCommand = jest.fn();
  storageListeners: Record<string, (value: any) => void> = {};
  store = {
    getStorageItem: jest.fn().mockResolvedValue(undefined),
    setStorageItem: jest.fn().mockResolvedValue(undefined),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    updateUiSettings: jest.fn().mockResolvedValue(undefined),
    getSettingsSnapshot: jest.fn(() => ({} as any)),
    updateHerbCounts: jest.fn().mockResolvedValue(undefined),
    subscribeStorage: jest.fn((key: string, cb: (value: any) => void) => {
      this.storageListeners[key] = cb;
      return jest.fn();
    }),
  } as any;
  emitStorage(key: string, value: any) {
    this.storageListeners[key]?.(value);
  }
}

describe('userTriggers', () => {
  test('macros modify match only', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.store.subscribeStorage.mock.calls[0][1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'uppercase' }] }];
    apply(list);
    const result = client.Triggers.parseLine('bar foo baz', '');
    expect(result).toBe('bar FOO baz');
  });

  test('uppercase does not break colors', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.store.subscribeStorage.mock.calls[0][1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'color', color: '#ff0000' }, { type: 'uppercase' }] }];
    apply(list);
    const code = findClosestColor('#ff0000');
    const result = client.Triggers.parseLine('bar foo baz', '');
    expect(result).toBe(`bar \x1B[22;38;5;${code}mFOO\x1B[0m baz`);
  });

  test('replace uses pattern match', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.store.subscribeStorage.mock.calls[0][1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'replace', to: 'bar' }] }];
    apply(list);
    const result = client.Triggers.parseLine('foo foo', '');
    expect(result).toBe('bar bar');
  });

  test('beep plays sound', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.store.subscribeStorage.mock.calls[0][1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'beep' }] }];
    apply(list);
    const result = client.Triggers.parseLine('foo', '');
    expect(result).toBe('foo');
    expect(client.playSound).toHaveBeenCalledWith('beep');
  });

  test('command sends command', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.store.subscribeStorage.mock.calls[0][1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'command', command: 'bar' }] }];
    apply(list);
    const result = client.Triggers.parseLine('foo', '');
    expect(result).toBe('foo');
    expect(client.sendCommand).toHaveBeenCalledWith('bar');
  });
});

