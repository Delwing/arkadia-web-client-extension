import Triggers from '../src/Triggers';

describe('Triggers', () => {
  test('parseLine executes registered trigger and returns callback output', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn(() => 'processed');
    triggers.registerTrigger(/foo/, cb);

    const result = triggers.parseLine('foo', '');

    expect(cb).toHaveBeenCalledTimes(1);
    expect(result).toBe('processed');
  });

  test('registerOneTimeTrigger only fires once', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerOneTimeTrigger(/bar/, cb);

    triggers.parseLine('bar', '');
    triggers.parseLine('bar', '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('removeByTag removes triggers recursively', () => {
    const triggers = new Triggers({} as any);
    const parent = triggers.registerTrigger(/baz/, undefined, 'parent');
    const childCb = jest.fn();
    parent.registerChild(/child/, childCb, 'child');

    triggers.removeByTag('child');

    triggers.parseLine('child', '');
    expect(childCb).not.toHaveBeenCalled();
  });

  test('parseMultiline executes registered multiline trigger', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn(() => 'changed');
    triggers.registerMultilineTrigger(/foo\nbar/, cb);

    const result = triggers.parseMultiline('foo\nbar', '');

    expect(cb).toHaveBeenCalledTimes(1);
    expect(result).toBe('changed');
  });

  test('trigger stays open for specified lines enabling children', () => {
    const triggers = new Triggers({} as any);
    const parent = triggers.registerTrigger(/start/, undefined, undefined, { stayOpenLines: 2 });
    const childCb = jest.fn();
    parent.registerChild(/child/, childCb);

    triggers.parseLine('start', '');
    triggers.parseLine('child', '');
    triggers.parseLine('child', '');
    triggers.parseLine('child', '');

    expect(childCb).toHaveBeenCalledTimes(2);
  });

  test('token trigger matches whole words', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTokenTrigger('hello', cb);

    triggers.parseLine('say hello there', '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('token trigger ignores partial matches', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTokenTrigger('hell', cb);

    triggers.parseLine('shell', '');

    expect(cb).not.toHaveBeenCalled();
  });

  test('token trigger matches multi word tokens', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTokenTrigger('hello world', cb);

    triggers.parseLine('say hello world there', '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('token trigger matches three word tokens', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTokenTrigger('one two three', cb);

    triggers.parseLine('prefix one two three suffix', '');

    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('token trigger passes correct substring to callback', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn((raw, _line, matches) => {
      return raw.substring(0, matches.index!) + '[' + matches[0] + ']' + raw.substring(matches.index! + matches[0].length);
    });
    triggers.registerTokenTrigger('Dargoth MC', cb);

    const result = triggers.parseLine('Spotykasz Dargoth MC tutaj.', '');

    expect(result).toBe('Spotykasz [Dargoth MC] tutaj.');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('array of patterns uses first match and stops checking further', () => {
    const triggers = new Triggers({} as any);
    const second = jest.fn();
    const cb = jest.fn();
    triggers.registerTrigger([/foo/, second], cb);

    triggers.parseLine('foo', '');

    expect(cb).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  test('array of patterns matches later pattern when earlier fails', () => {
    const triggers = new Triggers({} as any);
    const cb = jest.fn();
    triggers.registerTrigger([/foo/, /bar/], cb);

    triggers.parseLine('bar', '');

    expect(cb).toHaveBeenCalledTimes(1);
    const matches = cb.mock.calls[0][2];
    expect(matches[0]).toBe('bar');
  });

  test('triggerLine replace preserves ANSI formatting without manual handling', () => {
    const triggers = new Triggers({} as any);
    triggers.registerTrigger(/Azure/, (_raw, _line, matches, _type, triggerLine) => {
      expect(triggerLine).toBeDefined();
      triggerLine!.replace([matches.index!, matches.index! + matches[0].length], 'Blue');
      return undefined;
    });

    const result = triggers.parseLine('\u001b[34mAzure\u001b[0m sea', '');

    expect(result).toBe('\u001b[22;38;5;4mBlue\u001b[0m sea');
  });

  test('triggerLine insert retains hyperlink metadata', () => {
    const triggers = new Triggers({} as any);
    triggers.registerTrigger(/Map/, (_raw, _line, matches, _type, triggerLine) => {
      expect(triggerLine).toBeDefined();
      triggerLine!.insert(matches.index! + matches[0].length, ' link');
      return undefined;
    });

    const raw = '{clickOpen:9:map}Map{clickClose} ahead';
    const result = triggers.parseLine(raw, '');

    expect(result).toBe('{clickOpen:9:map}Map link{clickClose} ahead');
  });

  test('multiline triggers keep plain-text indices aligned with metadata', () => {
    const triggers = new Triggers({} as any);
    let observedIndex: number | undefined;
    triggers.registerMultilineTrigger(/Second/, (_raw, _line, matches, _type, triggerLine) => {
      expect(triggerLine).toBeDefined();
      const metadata = triggerLine!.matches.matches;
      expect(metadata?.index).toBe(matches.index);
      expect(triggerLine!.text.slice(matches.index!, matches.index! + matches[0].length)).toBe('Second');
      observedIndex = matches.index;
      return undefined;
    });

    const raw = '\u001b[31mFirst\u001b[0m line\n{clickOpen:7}Second{clickClose} line';
    triggers.parseMultiline(raw, '');

    expect(observedIndex).toBe('First line'.length + 1);
  });

  test('token triggers expose plain-text indices despite formatting', () => {
    const triggers = new Triggers({} as any);
    let observedIndex: number | undefined;
    triggers.registerTokenTrigger('Eamon', (_raw, _line, matches, _type, triggerLine) => {
      expect(triggerLine).toBeDefined();
      const metadata = triggerLine!.matches.matches;
      expect(metadata?.index).toBe(matches.index);
      expect(triggerLine!.text.slice(matches.index!, matches.index! + matches[0].length)).toBe('Eamon');
      observedIndex = matches.index;
      return undefined;
    });

    const raw = '\u001b[32mEamon\u001b[0m arrives in style';
    triggers.parseLine(raw, '');

    expect(observedIndex).toBe(0);
  });
});
