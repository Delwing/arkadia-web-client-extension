import initUserTriggers, { UserTrigger } from '../src/scripts/userTriggers';
import Triggers from '../src/Triggers';
import { findClosestColor } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  on = jest.fn();
  off = jest.fn();
  port = { postMessage: jest.fn() } as any;
  sendEvent = jest.fn();
  sendCommand = jest.fn();
}

describe('userTriggers', () => {
  test('macros modify match only', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'uppercase' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine('bar foo baz', '');
    expect(result).toBe('bar FOO baz');
  });

  test('uppercase does not break colors', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'color', color: '#ff0000' }, { type: 'uppercase' }] }];
    apply({ key: 'triggers', value: list });
    const code = findClosestColor('#ff0000');
    const result = client.Triggers.parseLine('bar foo baz', '');
    expect(result).toBe(`bar \x1B[22;38;5;${code}mFOO\x1B[0m baz`);
  });

  test('replace uses pattern match', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'replace', to: 'bar' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine('foo foo', '');
    expect(result).toBe('bar bar');
  });

  test('beep plays sound', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'beep' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine('foo', '');
    expect(result).toBe('foo');
    expect(client.sendEvent).toHaveBeenCalledWith('sound:play', { key: 'beep' });
  });

  test('command sends command', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'command', command: 'bar' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine('foo', '');
    expect(result).toBe('foo');
    expect(client.sendCommand).toHaveBeenCalledWith('bar');
  });
});
