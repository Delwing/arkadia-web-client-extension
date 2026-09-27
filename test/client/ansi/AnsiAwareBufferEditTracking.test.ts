import { AnsiAwareBuffer } from '@client/ansi/FormatState';

describe('AnsiAwareBuffer edit tracking', () => {
  const original = 'Ogromny cuchnacy troll atakuje';
  const troll: [number, number] = [17, 22];

  const tracked = () => new AnsiAwareBuffer(original).trackEditsFrom(original);
  const at = (buffer: AnsiAwareBuffer, range: [number, number]) => {
    const [start, end] = buffer.mapOriginalRange(range);
    return buffer.text.slice(start, end);
  };

  test('follows a prefix inserted before the range', () => {
    const buffer = tracked();
    buffer.prefix('[1/6] ');
    expect(at(buffer, troll)).toBe('troll');
  });

  test('keeps text inserted at the range edges outside it', () => {
    const buffer = tracked();
    buffer.insert(22, '>');
    buffer.insert(17, '<');
    expect(buffer.text).toBe('Ogromny cuchnacy <troll> atakuje');
    expect(at(buffer, troll)).toBe('troll');
  });

  test('stays exact through recolouring that covers the range', () => {
    const buffer = tracked();
    buffer.prefix('[1/6] ');
    buffer.color([6, 6 + original.length], { foreground: { space: 'hex', color: '#ff0000' } });
    buffer.color([14, 16], { bold: true });
    expect(at(buffer, troll)).toBe('troll');
  });

  test('follows removals and replacements before the range', () => {
    const buffer = tracked();
    buffer.replace([0, 7], 'Maly');
    buffer.remove([4, 5]);
    expect(buffer.text).toBe('Malycuchnacy troll atakuje');
    expect(at(buffer, troll)).toBe('troll');
  });

  test('shrinks with a replacement of the range itself', () => {
    const buffer = tracked();
    buffer.replace(troll, 'ork');
    expect(at(buffer, troll)).toBe('ork');
  });

  test('keeps tracking when re-anchored to the same original', () => {
    const buffer = tracked();
    buffer.prefix('> ');
    buffer.trackEditsFrom(original);
    expect(at(buffer, troll)).toBe('troll');
  });

  test('leaves the range unchanged when edits were not tracked', () => {
    const buffer = new AnsiAwareBuffer('> ' + original).trackEditsFrom(original);
    expect(buffer.mapOriginalRange(troll)).toEqual(troll);
  });
});
