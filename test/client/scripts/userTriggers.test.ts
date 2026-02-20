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
  FunctionalBind = {
    set: jest.fn(),
    clear: jest.fn(),
  } as any;
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

  test('slowBlink applies slow blink to match', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'slowBlink' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), '');

    expect(result?.text).toBe('bar foo baz');

    const segments = result?.getSegments() ?? [];
    const fooSegment = segments.find(seg => seg.text === 'foo');
    expect(fooSegment).toBeDefined();
    expect(fooSegment?.state?.slowBlink).toBe(true);
  });

  test('rapidBlink applies rapid blink to match', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'rapidBlink' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), '');

    expect(result?.text).toBe('bar foo baz');

    const segments = result?.getSegments() ?? [];
    const fooSegment = segments.find(seg => seg.text === 'foo');
    expect(fooSegment).toBeDefined();
    expect(fooSegment?.state?.rapidBlink).toBe(true);
  });

  test('slowBlink preserves existing color', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'color', color: '#ff0000' }, { type: 'slowBlink' }] }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), '');

    expect(result?.text).toBe('bar foo baz');

    const segments = result?.getSegments() ?? [];
    const fooSegment = segments.find(seg => seg.text === 'foo');
    expect(fooSegment).toBeDefined();
    expect(fooSegment?.state?.foreground).toBeDefined();
    expect(fooSegment?.state?.slowBlink).toBe(true);
  });

  test('functionalBind sets functional bind with label and command', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{
      pattern: 'foo',
      macros: [{ type: 'functionalBind', label: 'Attack', command: 'zabij cel' }]
    }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');

    expect(result?.text).toBe('foo');
    expect(client.FunctionalBind.set).toHaveBeenCalledWith('Attack', expect.any(Function));

    // Test that the callback executes the correct command
    const callback = client.FunctionalBind.set.mock.calls[0][1];
    callback();
    expect(client.sendCommand).toHaveBeenCalledWith('zabij cel');
  });

  test('gmcpMsgType filters trigger to matching type only', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{
      pattern: 'foo',
      gmcpMsgType: 'combat.avatar',
      macros: [{ type: 'uppercase' }]
    }];
    apply({ key: 'triggers', value: list });

    // Should NOT apply when type doesn't match
    const result1 = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), 'comm');
    expect(result1?.text).toBe('bar foo baz');

    // Should apply when type matches
    const result2 = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), 'combat.avatar');
    expect(result2?.text).toBe('bar FOO baz');
  });

  test('trigger without gmcpMsgType matches all types', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{
      pattern: 'foo',
      macros: [{ type: 'uppercase' }]
    }];
    apply({ key: 'triggers', value: list });

    const result1 = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), 'comm');
    expect(result1?.text).toBe('bar FOO baz');

    const result2 = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), 'combat.avatar');
    expect(result2?.text).toBe('bar FOO baz');
  });

  test('functionalBind does nothing if label or command is missing', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.on.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{
      pattern: 'foo',
      macros: [{ type: 'functionalBind', label: 'Attack' }]
    }];
    apply({ key: 'triggers', value: list });
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');

    expect(result?.text).toBe('foo');
    expect(client.FunctionalBind.set).not.toHaveBeenCalled();
  });
});
