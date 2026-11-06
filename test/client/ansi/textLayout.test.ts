import { AnsiAwareBuffer } from '@client/ansi/AnsiAwareBuffer.ts';
import { renderTable } from '@client/ansi/table';
import { createOutputApi } from '@client/PluginApi/output';
import type { PluginApiContext } from '@client/PluginApi/context';

const linkedWord = (text: string) => new AnsiAwareBuffer(text, { fg: '#ff0000', link: () => {} });
const plainTail = (b: AnsiAwareBuffer) => b.getSegments().at(-1)!.state;

describe('layout methods', () => {
    it('slice copies part of a line with its formatting', () => {
        const line = new AnsiAwareBuffer('ab').append('cd', { fg: 'red' });
        const part = line.slice(1, 3);
        expect(part.text).toBe('bc');
        expect(part.getSegments().map(s => [s.text, !!s.state?.foreground])).toEqual([['b', false], ['c', true]]);
        expect(line.text).toBe('abcd');
        expect(line.slice(-5, 99).text).toBe('abcd');
    });

    it('padEnd / padStart / center pad with plain text, never the link or colour next to it', () => {
        expect(plainTail(linkedWord('x').padEnd(4))).toBeUndefined();
        expect(linkedWord('x').padStart(3).getSegments()[0]).toEqual({ text: '  ', state: undefined });
        expect(new AnsiAwareBuffer('ab').center(7, '.').text).toBe('..ab...');
        expect(new AnsiAwareBuffer('abc').padEnd(2).text).toBe('abc');
    });

    it('truncate ends with an ellipsis coloured like the text but not linked', () => {
        const line = linkedWord('dlugi tekst').truncate(6);
        expect(line.text).toBe('dlugi…');
        const ellipsis = plainTail(line)!;
        expect(ellipsis.foreground).toEqual({ space: 'hex', color: '#ff0000' });
        expect(ellipsis.hyperlink).toBeUndefined();
        expect(new AnsiAwareBuffer('abc').truncate(5).text).toBe('abc');
    });

    it('wrap breaks at spaces, hard-breaks long words, honours \\n and indent', () => {
        const wrap = (t: string, w: number, indent?: number) =>
            new AnsiAwareBuffer(t).wrap(w, { indent }).map(l => l.text);
        expect(wrap('ala ma kota', 6)).toEqual(['ala ma', 'kota']);
        expect(wrap('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
        expect(wrap('one\ntwo three', 5)).toEqual(['one', 'two', 'three']);
        expect(wrap('aa bb cc dd', 5, 2)).toEqual(['aa bb', '  cc', '  dd']);
    });

    it('wrap keeps links on the words that had them', () => {
        const line = new AnsiAwareBuffer('see ').appendBuffer(linkedWord('this')).append(' now', {});
        const [first, second] = line.wrap(8);
        expect(first.text).toBe('see this');
        expect(first.getSegments().find(s => s.text === 'this')!.state?.hyperlink).toBeDefined();
        expect(second.getSegments()[0].state?.hyperlink).toBeUndefined();
    });
});

describe('renderTable', () => {
    it('draws the client frame with title, header and aligned columns', () => {
        const table = renderTable({
            title: 'Ziola',
            columns: ['Nazwa', { header: 'Ilosc', align: 'right' }],
            rows: [['leczace', 3], ['bylica', 12]],
        });
        expect(table.text.split('\n')).toEqual([
            '/-----------------\\',
            '|      Ziola      |',
            '+---------+-------+',
            '| Nazwa   | Ilosc |',
            '+---------+-------+',
            '| leczace |     3 |',
            '| bylica  |    12 |',
            '\\-----------------/',
        ]);
    });

    it('works without title or header and widens for a long title', () => {
        expect(renderTable({ rows: [['a', 'b']] }).text.split('\n')).toEqual([
            '/-------\\',
            '| a | b |',
            '\\-------/',
        ]);
        const lines = renderTable({ title: 'Dlugi tytul', rows: [['x']] }).text.split('\n');
        expect(new Set(lines.map(l => l.length)).size).toBe(1);
        expect(lines[1]).toBe('| Dlugi tytul |');
    });

    it('keeps cell colours and links and does not change the line passed in', () => {
        const name = linkedWord('Leczenie');
        const table = renderTable({ rows: [[name.select().bold(), 'x']] });
        const cell = table.getSegments().find(s => s.text === 'Leczenie')!;
        expect(cell.state?.hyperlink).toBeDefined();
        expect(cell.state?.bold).toBe(true);
        // Padding and frame after the link stay plain.
        const after = table.getSegments()[table.getSegments().indexOf(cell) + 1];
        expect(after.state?.hyperlink).toBeUndefined();
        // The input line is not padded or otherwise changed.
        expect(name.text).toBe('Leczenie');
    });

    it('narrows to the width and wraps cells instead of cutting them', () => {
        const table = renderTable({ rows: [['krotki', 'bardzo dlugi opis przedmiotu']] }, 30);
        const lines = table.text.split('\n');
        expect(Math.max(...lines.map(l => l.length))).toBeLessThanOrEqual(30);
        expect(lines.length).toBeGreaterThan(3);
        expect(table.text.replace(/[|\s\\/-]+/g, ' ')).toContain('bardzo dlugi');
    });

    it('keeps to a width too narrow for 3-character columns, as long as the columns fit at all', () => {
        const long = 'dlugi tekst w kolumnie';
        const width = (t: AnsiAwareBuffer) => Math.max(...t.text.split('\n').map(l => l.length));

        // Four columns at 3 characters would need 25.
        expect(width(renderTable({ rows: [[long, long, long, long]], maxWidth: 20 }))).toBeLessThanOrEqual(20);
        // One character per column is the floor: 4 columns need 17, so 10 overflows.
        expect(width(renderTable({ rows: [[long, long, long, long]], maxWidth: 10 }))).toBe(17);
    });

    it('styles title, header and frame; the result can still be selected and coloured', () => {
        const table = renderTable({
            title: 'T',
            columns: ['Kol'],
            rows: [['brak'], ['jest']],
            styles: { title: { fg: 'gold' }, header: { bold: true }, border: { fg: 'gray' } },
        });
        const seg = (t: string) => table.getSegments().find(s => s.text.includes(t))!;
        expect(seg('T').state?.foreground).toEqual({ space: 'rgb', r: 255, g: 215, b: 0 });
        expect(seg('Kol').state?.bold).toBe(true);
        expect(table.getSegments()[0].state?.foreground).toBeDefined();
        table.selectAll('brak').fg('red');
        expect(seg('brak').state?.foreground).toEqual({ space: 'rgb', r: 255, g: 0, b: 0 });
    });
});

describe('api.output', () => {
    function api(contentWidth = 0) {
        const print = vi.fn();
        const output = createOutputApi({ client: { print, contentWidth } } as unknown as PluginApiContext);
        return { output, print };
    }

    it('print takes a selection and prints its whole line', () => {
        const { output, print } = api();
        const line = new AnsiAwareBuffer('Haslo to: abc');
        output.print(line.select('abc').fg('slate_blue'));
        expect(print).toHaveBeenCalledWith(line);
    });

    it('width reports the console width; table fits it', () => {
        const { output } = api(20);
        expect(output.width).toBe(20);
        const table = output.table({ rows: [['a'.repeat(40)]] });
        expect(Math.max(...table.text.split('\n').map(l => l.length))).toBeLessThanOrEqual(20);
    });
});

describe('chaining selections in one line', () => {
    it('selection.select moves on to another part of the same line', () => {
        const line = new AnsiAwareBuffer('Haslo: abc, czas: 5 min');
        line.select('abc').fg('gold').select(/(\d+) min/, 1).bold();
        expect(line.getSegments().find(s => s.text === 'abc')!.state?.foreground).toBeDefined();
        expect(line.getSegments().find(s => s.text === '5')!.state?.bold).toBe(true);
    });

    it('building with append colours as you write, no selecting needed', () => {
        const line = new AnsiAwareBuffer('Haslo to: ').append('abc', { fg: 'slate_blue' }).append('!', {});
        expect(line.getSegments().map(s => [s.text, !!s.state?.foreground])).toEqual([
            ['Haslo to: ', false], ['abc', true], ['!', false],
        ]);
    });
});
