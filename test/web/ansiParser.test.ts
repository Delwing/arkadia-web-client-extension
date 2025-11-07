import { parseAnsiPatterns } from '@web/ansiParser';
import { colorCodes } from '@modules/core/Colors';

describe('parseAnsiPatterns', () => {
  test('parses standard ansi color', () => {
    const result = parseAnsiPatterns('\x1B[22;31mred\x1B[0m');
    expect(result).toBe(`<span style="color: ${colorCodes.ansi.dark[1]}">red</span>`);
  });

  test('parses 256 color code', () => {
    const result = parseAnsiPatterns(`\x1B[22;38;5;2mX\x1B[0m`);
    expect(result).toBe(`<span style="color: ${colorCodes.xterm[1]}">X</span>`);
  });
});
