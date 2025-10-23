import AnsiString from '../src/AnsiString';

describe('AnsiString', () => {
  test('indexOf ignores ansi color codes', () => {
    const ansi = new AnsiString('\x1b[31mHel\x1b[0mlo');
    expect(ansi.indexOf('Hello')).toBe(0);
  });

  test('replacing text inside colored segment preserves color codes', () => {
    const ansi = new AnsiString('\x1b[31mHello\x1b[0m');
    ansi.replacePlainRange(2, 4, 'XX');
    expect(ansi.getRaw()).toBe('\x1b[31mHeXXo\x1b[0m');
  });

  test('inserting text inside colored segment keeps surrounding color', () => {
    const ansi = new AnsiString('\x1b[32mHello\x1b[0m');
    ansi.insertPlain(3, 'X');
    expect(ansi.getRaw()).toBe('\x1b[32mHelXlo\x1b[0m');
  });
});
