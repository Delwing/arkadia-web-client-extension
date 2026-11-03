import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { createHeader, createPad } from '@client/scripts/counterTableUtils';

const RED = { foreground: { space: 'hex' as const, color: '#ff0000' } };

describe('createPad', () => {
    const pad = createPad(12, 2, 2); // 8 characters of content

    it('pads short content to the column with plain spaces, not the cell\'s colour or link', () => {
        const cell = new AnsiAwareBuffer('abc', { ...RED, hyperlink: { title: 'x' } });
        const line = pad(cell);
        expect(line.text).toBe('|  abc       |');
        const segments = line.getSegments();
        const abc = segments.find(s => s.text === 'abc')!;
        expect(abc.state?.foreground).toEqual(RED.foreground);
        expect(abc.state?.hyperlink).toBeDefined();
        const after = segments[segments.indexOf(abc) + 1];
        expect(after.state).toBeUndefined();
        expect(cell.text).toBe('abc');
    });

    it('cuts long content to the column, keeping each piece\'s own formatting', () => {
        const cell = new AnsiAwareBuffer('red', RED).append(' plain text', {});
        const line = pad(cell);
        expect(line.text).toBe('|  red plai  |');
        expect(line.getSegments().map(s => [s.text, !!s.state?.foreground])).toEqual([
            ['|  ', false], ['red', true], [' plai  |', false],
        ]);
    });

    it('draws an empty row', () => {
        expect(pad().text).toBe('|            |');
    });
});

describe('createHeader', () => {
    it('keeps the space after a coloured title plain', () => {
        const line = createHeader(20, 4, { ...RED, background: { space: 'hex', color: '#000000' } })('Tytul');
        expect(line.text).toBe('+----- Tytul ------+');
        // Only the title itself is coloured; the space after it isn't part of it.
        expect(line.getSegments().filter(s => s.state).map(s => s.text)).toEqual(['Tytul']);
    });
});
