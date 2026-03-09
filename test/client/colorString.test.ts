import { colorStringInLine, colorTokenInLine } from '@modules/core/Colors';
import { AnsiAwareBuffer, FormatStateSnapshot } from '@client/ansi/FormatState';

describe('colorString', () => {
  test('returns input when substring missing', () => {
    const input = new AnsiAwareBuffer('some text');
    const result = colorStringInLine(input, 'missing', { foreground: { space: 'indexed', index: 1 } });
    expect(result).toBe(input);
    expect(result.text).toBe('some text');
  });

  describe('preserves existing hyperlinks', () => {
    const magicColor: FormatStateSnapshot = { foreground: { space: 'indexed', index: 5 } };

    test('colorTokenInLine preserves hyperlink on colored text', () => {
      const buffer = new AnsiAwareBuffer('Zauważasz przy nim zloty klucz i miecz.');
      const onClick = jest.fn();

      // Simulate lootParser: first color, then link
      buffer.color([19, 30], magicColor);
      buffer.createLink([19, 30], { onClick, title: 'wez zloty klucz z ciala orka' });

      // Verify link exists before magic coloring
      const stateBefore = buffer.getStateAt(19);
      expect(stateBefore?.hyperlink).toBeDefined();
      expect(stateBefore?.hyperlink?.onClick).toBe(onClick);

      // Simulate magics trigger firing after lootParser
      const result = colorTokenInLine(buffer, 'zloty klucz', magicColor);

      // Hyperlink must still be present after coloring
      const stateAfter = result.getStateAt(19);
      expect(stateAfter?.hyperlink).toBeDefined();
      expect(stateAfter?.hyperlink?.onClick).toBe(onClick);
      expect(stateAfter?.hyperlink?.title).toBe('wez zloty klucz z ciala orka');
    });

    test('colorStringInLine preserves hyperlink on colored text', () => {
      const buffer = new AnsiAwareBuffer('Zauważasz przy nim srebrny klucz i miecz.');
      const onClick = jest.fn();

      buffer.color([19, 32], magicColor);
      buffer.createLink([19, 32], { onClick, title: 'wez srebrny klucz z ciala orka' });

      const result = colorStringInLine(buffer, 'srebrny klucz', magicColor);

      const stateAfter = result.getStateAt(19);
      expect(stateAfter?.hyperlink).toBeDefined();
      expect(stateAfter?.hyperlink?.onClick).toBe(onClick);
    });

    test('colorTokenInLine preserves hyperlink with case-insensitive match', () => {
      const buffer = new AnsiAwareBuffer('Widzisz Zloty Klucz na ziemi.');
      const onClick = jest.fn();

      buffer.createLink([8, 20], { onClick, title: 'wez Zloty Klucz' });

      // Magic trigger matches case-insensitively
      const result = colorTokenInLine(buffer, 'zloty klucz', magicColor);

      expect(result.text).toBe('Widzisz Zloty Klucz na ziemi.');
      const stateAfter = result.getStateAt(8);
      expect(stateAfter?.hyperlink).toBeDefined();
      expect(stateAfter?.hyperlink?.onClick).toBe(onClick);
      // Color should also be applied
      expect(stateAfter?.foreground).toEqual(magicColor.foreground);
    });
  });
});
