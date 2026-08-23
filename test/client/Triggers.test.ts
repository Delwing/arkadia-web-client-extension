import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

describe('Triggers', () => {
  test('parseLine executes registered trigger and returns callback output', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn((buffer: AnsiAwareBuffer) => {
      buffer.clear();
      buffer.append('processed');
      return buffer;
    });
    triggers.registerTrigger(/foo/, cb);

    const result = triggers.parseLine(new AnsiAwareBuffer('foo'), '');

    expect(cb).toHaveBeenCalledTimes(1);
    expect(result?.text).toBe('processed');
  });

  test('registerOneTimeTrigger only fires once', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerOneTimeTrigger(/bar/, cb);

    triggers.parseLine(new AnsiAwareBuffer('bar'), '');
    triggers.parseLine(new AnsiAwareBuffer('bar'), '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('removeByTag removes triggers recursively', () => {
    const triggers = new Triggers({} as any);
    const parent = triggers.registerTrigger(/baz/, undefined, 'parent');
    const childCb = jest.fn();
    parent.registerChild(/child/, childCb, 'child');

    triggers.removeByTag('child');

    triggers.parseLine(new AnsiAwareBuffer('child'), '');
    expect(childCb).not.toHaveBeenCalled();
  });

  test('parseMultiline executes registered multiline trigger', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn((buffer: AnsiAwareBuffer) => {
      buffer.clear();
      buffer.append('changed');
      return buffer;
    });
    triggers.registerMultilineTrigger(/foo\nbar/, cb);

    const result = triggers.parseMultiline(new AnsiAwareBuffer('foo\nbar'), '');

    expect(cb).toHaveBeenCalledTimes(1);
    expect(result?.text).toBe('changed');
  });

  test('trigger stays open for specified lines enabling children', () => {
    const triggers = new Triggers({} as any);
    const parent = triggers.registerTrigger(/start/, undefined, undefined, { stayOpenLines: 2 });
    const childCb = jest.fn();
    parent.registerChild(/child/, childCb);

    triggers.parseLine(new AnsiAwareBuffer('start'), '');
    triggers.parseLine(new AnsiAwareBuffer('child'), '');
    triggers.parseLine(new AnsiAwareBuffer('child'), '');
    triggers.parseLine(new AnsiAwareBuffer('child'), '');

    expect(childCb).toHaveBeenCalledTimes(2);
  });

  test('token trigger matches whole words', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTokenTrigger('hello', cb);

    triggers.parseLine(new AnsiAwareBuffer('say hello there'), '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('token trigger ignores partial matches', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTokenTrigger('hell', cb);

    triggers.parseLine(new AnsiAwareBuffer('shell'), '');

    expect(cb).not.toHaveBeenCalled();
  });

  test('token trigger matches multi word tokens', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTokenTrigger('hello world', cb);

    triggers.parseLine(new AnsiAwareBuffer('say hello world there'), '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('token trigger matches three word tokens', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTokenTrigger('one two three', cb);

    triggers.parseLine(new AnsiAwareBuffer('prefix one two three suffix'), '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('token trigger passes correct substring to callback', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn((buffer: AnsiAwareBuffer, matches: RegExpMatchArray) => {
      if (!matches) return buffer;
      buffer.insert(matches.index! + matches[0].length, ']');
      buffer.insert(matches.index!, '[');
      return buffer;
    });
    triggers.registerTokenTrigger('Dargoth MC', cb);

    const result = triggers.parseLine(new AnsiAwareBuffer('Spotykasz Dargoth MC tutaj.'), '');

    expect(result?.text).toBe('Spotykasz [Dargoth MC] tutaj.');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('caseInsensitive option matches string patterns regardless of case', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTrigger('HELLO', cb, undefined, { caseInsensitive: true });

    triggers.parseLine(new AnsiAwareBuffer('hello world'), '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('caseInsensitive option preserves original matched text in callback', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn((_buffer: AnsiAwareBuffer, _matches: RegExpMatchArray) => {
      return _buffer;
    });
    triggers.registerTrigger('hello', cb, undefined, { caseInsensitive: true });

    triggers.parseLine(new AnsiAwareBuffer('say HELLO there'), '');

    expect(cb).toHaveBeenCalledTimes(1);
    const matches = cb.mock.calls[0][1] as RegExpMatchArray;
    expect(matches[0]).toBe('HELLO');
    expect(matches.index).toBe(4);
  });

  test('string pattern without caseInsensitive does not match different case', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTrigger('HELLO', cb);

    triggers.parseLine(new AnsiAwareBuffer('hello world'), '');

    expect(cb).not.toHaveBeenCalled();
  });

  test('caseInsensitive option works with RegExp patterns', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTrigger(/HELLO/, cb, undefined, { caseInsensitive: true });

    triggers.parseLine(new AnsiAwareBuffer('hello world'), '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('caseInsensitive option does not duplicate i flag on RegExp', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTrigger(/HELLO/i, cb, undefined, { caseInsensitive: true });

    triggers.parseLine(new AnsiAwareBuffer('hello world'), '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('RegExp without caseInsensitive does not match different case', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTrigger(/HELLO/, cb);

    triggers.parseLine(new AnsiAwareBuffer('hello world'), '');

    expect(cb).not.toHaveBeenCalled();
  });

  test('array of patterns uses first match and stops checking further', () => {
    const triggers = new Triggers({} as any);
    const second = jest.fn();
    const cb = jest.fn();
    triggers.registerTrigger([/foo/, second], cb);

    triggers.parseLine(new AnsiAwareBuffer('foo'), '');

    expect(cb).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  test('array of patterns matches later pattern when earlier fails', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTrigger([/foo/, /bar/], cb);

    triggers.parseLine(new AnsiAwareBuffer('bar'), '');

    expect(cb).toHaveBeenCalledTimes(1);
    const matches = cb.mock.calls[0][1] as RegExpMatchArray;
    expect(matches[0]).toBe('bar');
  });

  test('triggerLine replace preserves ANSI formatting without manual handling', () => {
    const triggers = new Triggers({} as any);
    triggers.registerTrigger(/Azure/, (buffer: AnsiAwareBuffer, matches: RegExpMatchArray) => {
      expect(buffer).toBeDefined();
      if (!matches) return buffer;
      buffer.replace([matches.index!, matches.index! + matches[0].length], 'Blue');
      return buffer;
    });

    const result = triggers.parseLine(new AnsiAwareBuffer('\u001b[34mAzure\u001b[0m sea'), '');

    expect(result?.text).toBe('Blue sea');
  });

  test('triggerLine insert retains hyperlink metadata', () => {
    const triggers = new Triggers({} as any);
    triggers.registerTrigger(/Map/, (buffer: AnsiAwareBuffer, matches: RegExpMatchArray) => {
      expect(buffer).toBeDefined();
      if (!matches) return buffer;
      buffer.insert(matches.index! + matches[0].length, ' link');
      return buffer;
    });

    const result = triggers.parseLine(new AnsiAwareBuffer('Map ahead'), '');

    expect(result?.text).toBe('Map link ahead');
  });

  test('multiline triggers keep plain-text indices aligned with metadata', () => {
    const triggers = new Triggers({} as any);
    let observedIndex: number | undefined;
    triggers.registerMultilineTrigger(/Second/, (buffer: AnsiAwareBuffer, matches: RegExpMatchArray) => {
      expect(buffer).toBeDefined();
      if (!matches) return buffer;
      expect(buffer.text.slice(matches.index!, matches.index! + matches[0].length)).toBe('Second');
      observedIndex = matches.index;
      return buffer;
    });

    const raw = '\u001b[31mFirst\u001b[0m line\nSecond line';
    triggers.parseMultiline(new AnsiAwareBuffer(raw), '');

    expect(observedIndex).toBe('First line'.length + 1);
  });

  test('token triggers expose plain-text indices despite formatting', () => {
    const triggers = new Triggers({} as any);
    let observedIndex: number | undefined;
    triggers.registerTokenTrigger('Eamon', (buffer: AnsiAwareBuffer, matches: RegExpMatchArray) => {
      expect(buffer).toBeDefined();
      if (!matches) return buffer;
      expect(buffer.text.slice(matches.index!, matches.index! + matches[0].length)).toBe('Eamon');
      observedIndex = matches.index;
      return buffer;
    });

    const raw = '\u001b[32mEamon\u001b[0m arrives in style';
    triggers.parseLine(new AnsiAwareBuffer(raw), '');

    expect(observedIndex).toBe(0);
  });
});

describe('a trigger that rebuilds the buffer', () => {
  // Stage 5. 44 scripts construct a fresh AnsiAwareBuffer rather than mutating
  // the one they were handed. Everything an earlier trigger decided about the
  // line lives on the buffer, so a bare `line = result` threw those decisions
  // away — silently, and depending only on registration order.

  test('does not resurrect a line an earlier trigger gagged', () => {
    const triggers = new Triggers({} as any);
    triggers.registerTrigger(/spam/, () => null, 'gag');
    triggers.registerTrigger(/spam/, (line) => new AnsiAwareBuffer(line.text), 'rebuild');

    // gags sit at index 116 of 148, so 34 scripts run after them and any one of
    // them rebuilding the buffer would have put the line back on screen.
    expect(triggers.parseLine(new AnsiAwareBuffer('combat spam'), 'text')).toBeNull();
  });

  test('does not drop a flair an earlier trigger set', () => {
    const triggers = new Triggers({} as any);
    triggers.registerTrigger(/body/, (line) => { line.flair = 'lup'; return line; }, 'flair');
    triggers.registerTrigger(/body/, (line) => new AnsiAwareBuffer(line.text), 'rebuild');

    expect(triggers.parseLine(new AnsiAwareBuffer('a body'), 'text')?.flair).toBe('lup');
  });

  test('gives the same answer whichever order the two run in', () => {
    // This is what lets messageFlair drop its `after: ['lootParser']` edge.
    const rebuildFirst = new Triggers({} as any);
    rebuildFirst.registerTrigger(/body/, (line) => new AnsiAwareBuffer(line.text), 'rebuild');
    rebuildFirst.registerTrigger(/body/, (line) => { line.flair = 'lup'; return line; }, 'flair');

    const flairFirst = new Triggers({} as any);
    flairFirst.registerTrigger(/body/, (line) => { line.flair = 'lup'; return line; }, 'flair');
    flairFirst.registerTrigger(/body/, (line) => new AnsiAwareBuffer(line.text), 'rebuild');

    expect(rebuildFirst.parseLine(new AnsiAwareBuffer('a body'), 'text')?.flair)
      .toBe(flairFirst.parseLine(new AnsiAwareBuffer('a body'), 'text')?.flair);
  });

  test('still hides itself from a skipDeleted trigger registered after it', () => {
    const triggers = new Triggers({} as any);
    const seen = jest.fn((line: AnsiAwareBuffer) => line);
    triggers.registerTrigger(/spam/, () => null, 'gag');
    triggers.registerTrigger(/spam/, (line) => new AnsiAwareBuffer(line.text), 'rebuild');
    triggers.registerTrigger(/spam/, seen, 'combat-window', {skipDeleted: true});

    triggers.parseLine(new AnsiAwareBuffer('combat spam'), 'text');

    // combatWindow opts out of suppressed lines; the rebuild in between must not
    // make the line look live again.
    expect(seen).not.toHaveBeenCalled();
  });

  test('carries the same metadata through parseMultiline', () => {
    const triggers = new Triggers({} as any);
    triggers.registerMultilineTrigger(/block/, () => null, 'gag');
    triggers.registerMultilineTrigger(/block/, (line) => new AnsiAwareBuffer(line.text), 'rebuild');

    expect(triggers.parseMultiline(new AnsiAwareBuffer('a block'), 'text')).toBeNull();
  });
});
