import { colorStringInLine } from '@modules/core/Colors';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

describe('colorString', () => {
  test('returns input when substring missing', () => {
    const input = new AnsiAwareBuffer('some text');
    const result = colorStringInLine(input, 'missing', { foreground: { space: 'indexed', index: 1 } });
    expect(result).toBe(input);
    expect(result.text).toBe('some text');
  });
});
