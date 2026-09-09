import { vi } from 'vitest';
import initUserTriggers, { UserTrigger } from '@client/scripts/userTriggers';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { globalStorage } from '@modules/core/storage';
import { sendPush } from '@modules/push/pushClient';

vi.mock('@modules/push/pushClient', () => ({
  sendPush: vi.fn().mockResolvedValue({ ok: true, delivered: 1 }),
}));

const mockedSendPush = vi.mocked(sendPush);

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  /** Minimal event bus, so event triggers can be exercised too. */
  handlers = new Map<string, ((payload?: unknown) => void)[]>();
  sendEvent = jest.fn((type: string, payload?: unknown) => {
    [...(this.handlers.get(type) ?? [])].forEach(h => h(payload));
  });
  on = (event: string, handler: (payload?: unknown) => void) => {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  };
  off = (event: string, handler: (payload?: unknown) => void) => {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter(h => h !== handler));
  };
  sendCommand = jest.fn();
  FunctionalBind = {
    set: jest.fn(),
    clear: jest.fn(),
  } as any;
}

describe('userTriggers', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('macros modify match only', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'uppercase' }] }];
    globalStorage.set('triggers', list);
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), '');
    expect(result?.text).toBe('bar FOO baz');
  });

  test('uppercase does not break colors', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'color', color: '#ff0000' }, { type: 'uppercase' }] }];
    globalStorage.set('triggers', list);
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
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'replace', to: 'bar' }] }];
    globalStorage.set('triggers', list);
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo foo'), '');
    // Only the first match is replaced
    expect(result?.text).toBe('bar foo');
  });

  test('beep plays sound', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'beep' }] }];
    globalStorage.set('triggers', list);
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');
    expect(result?.text).toBe('foo');
    expect(client.sendEvent).toHaveBeenCalledWith('sound:play', { key: 'beep' });
  });

  test('command sends command', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'command', command: 'bar' }] }];
    globalStorage.set('triggers', list);
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');
    expect(result?.text).toBe('foo');
    expect(client.sendCommand).toHaveBeenCalledWith('bar');
  });

  test('notify emits notify event with system flag for given message', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'notify', message: 'hello' }] }];
    globalStorage.set('triggers', list);
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');
    expect(result?.text).toBe('foo');
    expect(client.sendEvent).toHaveBeenCalledWith('notify', { text: 'hello', system: true });
  });

  test('notify falls back to matched text when message is empty', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'notify' }] }];
    globalStorage.set('triggers', list);
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), '');
    expect(result?.text).toBe('bar foo baz');
    expect(client.sendEvent).toHaveBeenCalledWith('notify', { text: 'foo', system: true });
  });

  test('push sends the given message to paired devices', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'push', message: 'hello' }] }];
    globalStorage.set('triggers', list);
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');

    // The line itself must be untouched — push is a side effect, not a filter.
    expect(result?.text).toBe('foo');
    expect(mockedSendPush).toHaveBeenCalledWith(
      { title: 'Arkadia', body: 'hello' },
      { bypassCooldown: undefined },
    );
  });

  test('push falls back to the matched text when no message is given', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'push' }] }];
    globalStorage.set('triggers', list);
    client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), '');

    expect(mockedSendPush).toHaveBeenCalledWith(
      { title: 'Arkadia', body: 'foo' },
      { bypassCooldown: undefined },
    );
  });

  test('push passes the cooldown bypass through', () => {
    // Without this the alert can be swallowed by an unrelated hp alert that
    // happened to fire moments earlier, which reads as the macro not working.
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [
      { pattern: 'foo', macros: [{ type: 'push', message: 'urgent', bypassCooldown: true }] },
    ];
    globalStorage.set('triggers', list);
    client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');

    expect(mockedSendPush).toHaveBeenCalledWith(
      { title: 'Arkadia', body: 'urgent' },
      { bypassCooldown: true },
    );
  });

  test('event macros fill {name} placeholders from the payload', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{
      type: 'event',
      event: 'enemy.attack',
      macros: [{ type: 'push', message: 'Atakuje cie {attacker}!' }],
    }];
    globalStorage.set('triggers', list);
    client.sendEvent('enemy.attack', { attacker: 'Zbojca' });

    expect(mockedSendPush).toHaveBeenCalledWith(
      { title: 'Arkadia', body: 'Atakuje cie Zbojca!' },
      { bypassCooldown: undefined },
    );
  });

  test('an unknown placeholder is left visible rather than blanked', () => {
    // A literal {nonsense} arriving on the phone tells the player their
    // reference is wrong; an empty string would look like a misfire.
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{
      type: 'event',
      event: 'enemy.attack',
      macros: [{ type: 'push', message: 'Kto: {nonsense}' }],
    }];
    globalStorage.set('triggers', list);
    client.sendEvent('enemy.attack', { attacker: 'Zbojca' });

    expect(mockedSendPush).toHaveBeenCalledWith(
      { title: 'Arkadia', body: 'Kto: {nonsense}' },
      { bypassCooldown: undefined },
    );
  });

  test('a non-object payload is exposed as {value}', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{
      type: 'event',
      event: 'zaskTimer',
      macros: [{ type: 'command', command: 'echo {value}' }],
    }];
    globalStorage.set('triggers', list);
    client.sendEvent('zaskTimer', 12);

    expect(client.sendCommand).toHaveBeenCalledWith('echo 12');
  });

  test('slowBlink applies slow blink to match', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'slowBlink' }] }];
    globalStorage.set('triggers', list);
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
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'rapidBlink' }] }];
    globalStorage.set('triggers', list);
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
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'color', color: '#ff0000' }, { type: 'slowBlink' }] }];
    globalStorage.set('triggers', list);
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
    const list: UserTrigger[] = [{
      pattern: 'foo',
      macros: [{ type: 'functionalBind', label: 'Attack', command: 'zabij cel' }]
    }];
    globalStorage.set('triggers', list);
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
    const list: UserTrigger[] = [{
      pattern: 'foo',
      gmcpMsgType: 'combat.avatar',
      macros: [{ type: 'uppercase' }]
    }];
    globalStorage.set('triggers', list);

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
    const list: UserTrigger[] = [{
      pattern: 'foo',
      macros: [{ type: 'uppercase' }]
    }];
    globalStorage.set('triggers', list);

    const result1 = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), 'comm');
    expect(result1?.text).toBe('bar FOO baz');

    const result2 = client.Triggers.parseLine(new AnsiAwareBuffer('bar foo baz'), 'combat.avatar');
    expect(result2?.text).toBe('bar FOO baz');
  });

  test('functionalBind does nothing if label or command is missing', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const list: UserTrigger[] = [{
      pattern: 'foo',
      macros: [{ type: 'functionalBind', label: 'Attack' }]
    }];
    globalStorage.set('triggers', list);
    const result = client.Triggers.parseLine(new AnsiAwareBuffer('foo'), '');

    expect(result?.text).toBe('foo');
    expect(client.FunctionalBind.set).not.toHaveBeenCalled();
  });
});
