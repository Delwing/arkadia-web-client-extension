import initUserTriggers, { UserTrigger } from '@client/scripts/userTriggers';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

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
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), '');
    expect(result?.text).toBe('bar FOO baz');
  });

  test('uppercase does not break colors', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'color', color: '#ff0000' }, { type: 'uppercase' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), '');

    // Check text content
    expect(result?.text).toBe('bar FOO baz');

    // Check that FOO is colored (has foreground color applied)
    const segments = result?.getSegments() ?? [];
    const fooSegment = segments.find(seg => seg.text.includes('FOO'));
    expect(fooSegment).toBeDefined();
    expect(fooSegment?.state?.foreground).toBeDefined();
  });

  test('replace uses pattern match', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'replace', to: 'bar' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo foo'), '');
    // Only the first match is replaced
    expect(result?.text).toBe('bar foo');
  });

  test('beep plays sound', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'beep' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');
    expect(result?.text).toBe('foo');
    expect(client.sendEvent).toHaveBeenCalledWith('sound:play', { key: 'beep' });
  });

  test('command sends command', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'command', command: 'bar' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');
    expect(result?.text).toBe('foo');
    expect(client.sendCommand).toHaveBeenCalledWith('bar');
  });
});
