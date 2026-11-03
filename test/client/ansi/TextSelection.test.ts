import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { matchGroupRange } from '@client/ansi/style';

const fgOf = (line: AnsiAwareBuffer, text: string) =>
    line.getSegments().find(s => s.text === text)?.state?.foreground;

/** Runs `line` through a real trigger pass with the given callbacks, in order. */
function runTriggers(text: string, ...register: ((t: Triggers) => void)[]): AnsiAwareBuffer {
    const triggers = new Triggers({} as never);
    register.forEach(r => r(triggers));
    return triggers.parseLine(new AnsiAwareBuffer(text), '')!;
}

describe('select(matches) inside a trigger', () => {
    it('finds the match even after an earlier trigger prefixed the line', () => {
        const line = runTriggers('Widzisz miecz i miecz.',
            t => t.registerTrigger(/^Widzisz/, l => l.prefix('[!] ')),
            // The second "miecz" — indexOf would have found the first one.
            t => t.registerTrigger(/i (miecz)/, (l, m) => l.select(m, 1).fg('gold').line),
        );
        expect(line.text).toBe('[!] Widzisz miecz i miecz.');
        const golden = line.getSegments().filter(s => s.state?.foreground);
        expect(golden.map(s => s.text)).toEqual(['miecz']);
        expect(line.getSegments().map(s => s.text)).toEqual(['[!] Widzisz miecz i ', 'miecz', '.']);
    });

    it('a global regex trigger (no match position) selects the first occurrence in the original line', () => {
        const line = runTriggers('ab ab',
            t => t.registerTrigger(/^/, l => l.prefix('> ')),
            t => t.registerTrigger(/ab/g, (l, m) => l.select(m).bold().line),
        );
        expect(line.getSegments().map(s => [s.text, !!s.state?.bold])).toEqual([['> ', false], ['ab', true], [' ab', false]]);
    });

    it('places a capture group exactly without the d flag, even when its text repeats earlier in the match', () => {
        const line = runTriggers('aa bb aa',
            t => t.registerTrigger(/aa bb (aa)/, (l, m) => l.select(m, 1).bold().line),
        );
        const bold = line.getSegments().filter(s => s.state?.bold);
        expect(bold).toHaveLength(1);
        // The group is the last "aa", at 6, not the first.
        expect(line.getSegments().map(s => s.text)).toEqual(['aa bb ', 'aa']);
    });

    it('selects a named group', () => {
        const line = runTriggers('Masz 12 mithrylow',
            t => t.registerTrigger(/Masz (?<ile>\d+)/, (l, m) => l.select(m, 'ile').fg('#ffffff').line),
        );
        expect(fgOf(line, '12')).toEqual({ space: 'hex', color: '#ffffff' });
    });

    it('works with string and token triggers', () => {
        const line = runTriggers('Tu lezy zloto.',
            t => t.registerTrigger('zloto', (l, m) => l.select(m).fg('gold').line),
        );
        expect(fgOf(line, 'zloto')).toEqual({ space: 'rgb', r: 255, g: 215, b: 0 });
    });

    it('an unmatched group or a match function gives an empty selection that ignores changes', () => {
        const line = runTriggers('abc',
            t => t.registerTrigger(/a(x)?/, (l, m) => {
                const sel = l.select(m, 1);
                expect(sel.found).toBe(false);
                expect(sel.text).toBe('');
                return sel.fg('red').replace('zzz').after('!').line;
            }),
            t => t.registerTrigger(() => [] as unknown as RegExpMatchArray, (l, m) => l.select(m).fg('red').line),
        );
        expect(line.text).toBe('abc');
        expect(line.getSegments()).toEqual([{ text: 'abc', state: undefined }]);
    });
});

describe('select / selectAll by text, regex, range', () => {
    it('select() with no argument is the whole line', () => {
        const line = new AnsiAwareBuffer('whole');
        line.select().fg(196);
        expect(line.getSegments()[0].state?.foreground).toEqual({ space: 'indexed', index: 196 });
    });

    it('select(string) takes the first occurrence, selectAll every one', () => {
        const one = new AnsiAwareBuffer('x y x');
        one.select('x').bold();
        expect(one.getSegments().map(s => [s.text, !!s.state?.bold])).toEqual([['x', true], [' y x', false]]);

        const all = new AnsiAwareBuffer('Zloto i zloto');
        expect(all.selectAll('zloto', 0, { caseInsensitive: true }).count).toBe(2);
    });

    it('selectAll(regex, group) does not need the g flag', () => {
        const line = new AnsiAwareBuffer('3 mithrylow, 7 mithrylow');
        const sel = line.selectAll(/(\d+) mithrylow/, 1);
        expect(sel.texts).toEqual(['3', '7']);
    });

    it('select(range) rejects an out-of-bounds range', () => {
        expect(() => new AnsiAwareBuffer('ab').select([0, 5])).toThrow(RangeError);
    });
});

describe('selections follow edits', () => {
    it('before/after go outside the selection and later changes still hit the original text', () => {
        const line = new AnsiAwareBuffer('a sword here');
        const sword = line.select('sword');
        sword.before('<').after('>').fg('gold');
        expect(line.text).toBe('a <sword> here');
        expect(sword.text).toBe('sword');
        expect(fgOf(line, 'sword')).toBeDefined();
        expect(fgOf(line, '<')).toBeUndefined();
    });

    it('an edit elsewhere in the line moves the selection', () => {
        const line = new AnsiAwareBuffer('one two');
        const two = line.select('two');
        line.prefix('[x] ');
        line.select('one').replace('three');
        expect(two.text).toBe('two');
        expect(two.ranges).toEqual([[10, 13]]);
    });

    it('replace() covers the new text, keeps the old formatting, and takes a function', () => {
        const line = new AnsiAwareBuffer('the ').append('orc', { fg: '#ff0000' }).append(' dies', {});
        const sel = line.select('orc').replace(t => t.toUpperCase()).underline();
        expect(line.text).toBe('the ORC dies');
        expect(sel.text).toBe('ORC');
        const orc = line.getSegments().find(s => s.text === 'ORC')!;
        expect(orc.state?.foreground).toEqual({ space: 'hex', color: '#ff0000' });
        expect(orc.state?.underline).toBe(true);
    });

    it('selectAll replace with longer text keeps every later place right', () => {
        const line = new AnsiAwareBuffer('a a a');
        line.selectAll('a').replace('bbb').fg('#00ff00');
        expect(line.text).toBe('bbb bbb bbb');
        expect(line.getSegments().filter(s => s.state?.foreground).map(s => s.text)).toEqual(['bbb', 'bbb', 'bbb']);
    });

    it('remove() collapses the selection', () => {
        const line = new AnsiAwareBuffer('keep drop keep');
        const sel = line.select(' drop').remove();
        expect(line.text).toBe('keep keep');
        expect(sel.text).toBe('');
    });
});

describe('selection formatting keeps what it does not set', () => {
    it('fg() on linked text keeps the link; link() keeps the colour', () => {
        const click = vi.fn();
        const line = new AnsiAwareBuffer('take sword');
        line.select('sword').link(click).fg('gold');
        line.select('take').fg('red').link({ onClick: click, title: 'Take' });
        const sword = line.getSegments().find(s => s.text === 'sword')!;
        expect(sword.state?.hyperlink?.onClick).toBe(click);
        expect(sword.state?.foreground).toBeDefined();
        const take = line.getSegments().find(s => s.text === 'take')!;
        expect(take.state?.hyperlink?.title).toBe('Take');
        expect(take.state?.foreground).toEqual({ space: 'rgb', r: 255, g: 0, b: 0 });
    });

    it('restyle() clears everything, link included', () => {
        const line = new AnsiAwareBuffer('x');
        line.select().link(() => {}).fg('red').restyle({});
        expect(line.getSegments()).toEqual([{ text: 'x', state: undefined }]);
    });
});

describe('short style form', () => {
    it('append() takes fg/bg/link, so built output needs no position counting', () => {
        const click = vi.fn();
        const buf = new AnsiAwareBuffer()
            .append('[ ', { fg: 'white' })
            .append('Leczenie', { fg: '#ffa500', bold: true, link: click })
            .append(' ]', { fg: 'white' });
        const [open, name, close] = buf.getSegments();
        expect(open.state?.hyperlink).toBeUndefined();
        expect(name.state).toMatchObject({ foreground: { space: 'hex', color: '#ffa500' }, bold: true });
        expect(name.state?.hyperlink?.onClick).toBe(click);
        expect(close.state?.hyperlink).toBeUndefined();
    });

    it('works in the constructor, color(), prefix() and replace()', () => {
        const buf = new AnsiAwareBuffer('abc', { fg: 'red', bg: 'blue' });
        expect(buf.getSegments()[0].state).toMatchObject({
            foreground: { space: 'rgb', r: 255, g: 0, b: 0 },
            background: { space: 'rgb', r: 0, g: 0, b: 255 },
        });
        buf.color([0, 1], { fg: 21 }).prefix('> ', { fg: '#fff' }).replace([4, 5], 'C', { fg: 'green' });
        expect(buf.text).toBe('> abC');
        expect(buf.getSegments().map(s => s.state?.foreground)).toEqual([
            { space: 'hex', color: '#fff' },
            { space: 'indexed', index: 21 },
            { space: 'rgb', r: 255, g: 0, b: 0 },
            { space: 'rgb', r: 0, g: 255, b: 0 },
        ]);
    });

    it('rejects a colour it does not know, naming what it accepts', () => {
        expect(() => new AnsiAwareBuffer('x').select().fg('notacolour')).toThrow(/Unknown colour "notacolour"/);
        expect(() => new AnsiAwareBuffer('x').select().fg(300)).toThrow(RangeError);
    });
});

describe('matchGroupRange', () => {
    it('handles a global regex match (no index) by finding the first occurrence', () => {
        const m = 'x ab ab'.match(/ab/g)!;
        expect(matchGroupRange(m)).toBeUndefined();
        expect(matchGroupRange(m, 0, 'x ab ab')).toEqual([2, 4]);
    });

    it('uses indices when the regex has the d flag', () => {
        const m = 'aa bb aa'.match(/aa bb (aa)/d)!;
        expect(matchGroupRange(m, 1)).toEqual([6, 8]);
    });
});
