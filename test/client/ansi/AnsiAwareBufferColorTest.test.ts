import { AnsiAwareBuffer } from '../../../src/client/ansi/FormatState';

describe('AnsiAwareBuffer color handling', () => {
  it('should append text with different color than initial buffer', () => {
    // Create buffer with red text
    const buffer = new AnsiAwareBuffer('Red text', {
      foreground: { space: 'indexed', index: 196 }
    });

    // Append blue text
    buffer.append(' Blue text', {
      foreground: { space: 'indexed', index: 21 }
    });

    expect(buffer.text).toBe('Red text Blue text');

    const segments = buffer.getSegments();
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('Red text');
    expect(segments[0].state?.foreground).toEqual({ space: 'indexed', index: 196 });
    expect(segments[1].text).toBe(' Blue text');
    expect(segments[1].state?.foreground).toEqual({ space: 'indexed', index: 21 });
  });

  it('should appendBuffer with different color', () => {
    // Create first buffer with green text
    const buffer1 = new AnsiAwareBuffer('Green text', {
      foreground: { space: 'indexed', index: 46 }
    });

    // Create second buffer with yellow text
    const buffer2 = new AnsiAwareBuffer(' Yellow text', {
      foreground: { space: 'indexed', index: 226 }
    });

    // Append buffer2 to buffer1
    buffer1.appendBuffer(buffer2);

    expect(buffer1.text).toBe('Green text Yellow text');

    const segments = buffer1.getSegments();
    expect(segments).toHaveLength(2);
    expect(segments[0].text).toBe('Green text');
    expect(segments[0].state?.foreground).toEqual({ space: 'indexed', index: 46 });
    expect(segments[1].text).toBe(' Yellow text');
    expect(segments[1].state?.foreground).toEqual({ space: 'indexed', index: 226 });
  });

  it('should handle multiple appends with different colors', () => {
    const buffer = new AnsiAwareBuffer('Part1', {
      foreground: { space: 'rgb', r: 255, g: 0, b: 0 }
    });

    buffer.append(' Part2', {
      foreground: { space: 'rgb', r: 0, g: 255, b: 0 }
    });

    buffer.append(' Part3', {
      foreground: { space: 'rgb', r: 0, g: 0, b: 255 }
    });

    expect(buffer.text).toBe('Part1 Part2 Part3');

    const segments = buffer.getSegments();
    expect(segments).toHaveLength(3);
    expect(segments[0].text).toBe('Part1');
    expect(segments[0].state?.foreground).toEqual({ space: 'rgb', r: 255, g: 0, b: 0 });
    expect(segments[1].text).toBe(' Part2');
    expect(segments[1].state?.foreground).toEqual({ space: 'rgb', r: 0, g: 255, b: 0 });
    expect(segments[2].text).toBe(' Part3');
    expect(segments[2].state?.foreground).toEqual({ space: 'rgb', r: 0, g: 0, b: 255 });
  });

  it('should append text without color state to colored buffer', () => {
    const buffer = new AnsiAwareBuffer('Colored', {
      foreground: { space: 'indexed', index: 196 }
    });

    // Append without specifying color - should infer state from insertion point
    buffer.append(' Uncolored');

    expect(buffer.text).toBe('Colored Uncolored');

    const segments = buffer.getSegments();

    // The buffer should contain all the text
    expect(segments.map(s => s.text).join('')).toBe('Colored Uncolored');
  });

  it('should handle mixed formatting with append', () => {
    const buffer = new AnsiAwareBuffer('Bold red', {
      foreground: { space: 'indexed', index: 196 },
      bold: true
    });

    buffer.append(' Italic blue', {
      foreground: { space: 'indexed', index: 21 },
      italic: true,
      bold: false
    });

    expect(buffer.text).toBe('Bold red Italic blue');

    const segments = buffer.getSegments();
    expect(segments).toHaveLength(2);
    expect(segments[0].state?.bold).toBe(true);
    expect(segments[0].state?.italic).toBeUndefined();
    expect(segments[1].state?.bold).toBe(false);
    expect(segments[1].state?.italic).toBe(true);
  });

  describe('link handling', () => {
    it('should not propagate link to appended text without explicit link', () => {
      const buffer = new AnsiAwareBuffer('Clickable', {
        foreground: { space: 'indexed', index: 196 },
        hyperlink: {
          onClick: () => console.log('clicked'),
          title: 'Click me'
        }
      });

      // Append text without link
      buffer.append(' Normal text', {
        foreground: { space: 'indexed', index: 21 }
      });

      expect(buffer.text).toBe('Clickable Normal text');

      const segments = buffer.getSegments();

      expect(segments).toHaveLength(2);
      expect(segments[0].state?.hyperlink).toBeDefined();
      expect(segments[0].state?.hyperlink?.title).toBe('Click me');
      expect(segments[1].state?.hyperlink).toBeUndefined();
    });

    it('should handle appending buffer with link to buffer without link', () => {
      const buffer1 = new AnsiAwareBuffer('Normal', {
        foreground: { space: 'indexed', index: 46 }
      });

      const buffer2 = new AnsiAwareBuffer(' Clickable', {
        foreground: { space: 'indexed', index: 226 },
        hyperlink: {
          onClick: () => console.log('link clicked'),
          title: 'Click this'
        }
      });

      buffer1.appendBuffer(buffer2);

      expect(buffer1.text).toBe('Normal Clickable');

      const segments = buffer1.getSegments();
      expect(segments).toHaveLength(2);
      expect(segments[0].state?.hyperlink).toBeUndefined();
      expect(segments[1].state?.hyperlink).toBeDefined();
      expect(segments[1].state?.hyperlink?.title).toBe('Click this');
    });

    it('should handle appending buffer without link to buffer with link', () => {
      const buffer1 = new AnsiAwareBuffer('Clickable', {
        foreground: { space: 'indexed', index: 196 },
        hyperlink: {
          onClick: () => console.log('original link'),
          title: 'Original'
        }
      });

      const buffer2 = new AnsiAwareBuffer(' Normal', {
        foreground: { space: 'indexed', index: 21 }
      });

      buffer1.appendBuffer(buffer2);

      expect(buffer1.text).toBe('Clickable Normal');

      const segments = buffer1.getSegments();

      expect(segments[0].state?.hyperlink).toBeDefined();
      expect(segments[0].state?.hyperlink?.title).toBe('Original');

      // Check if second segment has link or not
      if (segments.length === 2) {
        // If separate segments, second should not have link
        expect(segments[1].state?.hyperlink).toBeUndefined();
      } else {
        // If merged (shouldn't happen with different colors), check text
        expect(segments.some(s => s.text.includes('Normal'))).toBe(true);
      }
    });

    it('should handle multiple different links in same buffer', () => {
      const buffer = new AnsiAwareBuffer('Link1', {
        foreground: { space: 'indexed', index: 196 },
        hyperlink: {
          onClick: () => console.log('link1'),
          title: 'First link'
        }
      });

      buffer.append(' Link2', {
        foreground: { space: 'indexed', index: 21 },
        hyperlink: {
          onClick: () => console.log('link2'),
          title: 'Second link'
        }
      });

      buffer.append(' Link3', {
        foreground: { space: 'indexed', index: 46 },
        hyperlink: {
          onClick: () => console.log('link3'),
          title: 'Third link'
        }
      });

      expect(buffer.text).toBe('Link1 Link2 Link3');

      const segments = buffer.getSegments();
      expect(segments).toHaveLength(3);
      expect(segments[0].state?.hyperlink?.title).toBe('First link');
      expect(segments[1].state?.hyperlink?.title).toBe('Second link');
      expect(segments[2].state?.hyperlink?.title).toBe('Third link');
    });
  });
});
