import { colorStringInLine } from '../src/Colors';
import TriggerLine from '../src/triggers/TriggerLine';

describe('colorString', () => {
  test('returns input when substring missing', () => {
    const input = new TriggerLine('some text');
    const result = colorStringInLine(input, 'missing', 1);
    expect(result).toBe(input);
    expect(result.toAnsiString()).toBe('some text');
  });
});
