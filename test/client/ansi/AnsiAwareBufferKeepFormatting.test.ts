import { AnsiAwareBuffer, FormatStateSnapshot } from '../../../src/client/ansi/FormatState';

const GOLD: FormatStateSnapshot = { foreground: { space: 'hex', color: '#ffd700' } };
const RED_BG: FormatStateSnapshot = { background: { space: 'hex', color: '#330000' } };

/** [text, foreground hex, background hex, has link] for every segment */
function describeSegments(buffer: AnsiAwareBuffer) {
    const hex = (c?: { space: string; color?: string }) => (c && c.space === 'hex' ? c.color : c?.space);
    return buffer.getSegments().map(s => [
        s.text,
        hex(s.state?.foreground as never),
        hex(s.state?.background as never),
        !!s.state?.hyperlink,
    ]);
}

function linked(text: string, onClick = () => {}): AnsiAwareBuffer {
    const buffer = new AnsiAwareBuffer(text);
    buffer.createLink([0, text.length], { onClick, title: 'link' });
    return buffer;
}

describe('colouring keeps what it does not set', () => {
    it('color() keeps a link an earlier trigger put on the text', () => {
        const onClick = vi.fn();
        const line = new AnsiAwareBuffer('Widzisz ').appendBuffer(linked('miecz', onClick)).append(' tutaj.');

        line.color([8, 13], GOLD);

        const sword = line.getSegments().find(s => s.text === 'miecz')!;
        expect(sword.state?.foreground).toEqual(GOLD.foreground);
        expect(sword.state?.hyperlink?.title).toBe('link');
        sword.state!.hyperlink!.onClick!({} as MouseEvent);
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('color() over a partly linked range links only the part that was linked', () => {
        const line = new AnsiAwareBuffer('a ').appendBuffer(linked('link')).append(' b', {});

        line.color([0, line.length], GOLD);

        expect(describeSegments(line)).toEqual([
            ['a ', '#ffd700', undefined, false],
            ['link', '#ffd700', undefined, true],
            [' b', '#ffd700', undefined, false],
        ]);
    });

    it('color() keeps the background and styles the game sent', () => {
        const line = new AnsiAwareBuffer('\x1b[4;44munderlined on blue\x1b[0m rest');

        line.color([0, 10], GOLD);

        const first = line.getSegments()[0];
        expect(first.text).toBe('underlined');
        expect(first.state?.foreground).toEqual(GOLD.foreground);
        expect(first.state?.background).toBeDefined();
        expect(first.state?.underline).toBe(true);
    });

    it('color() with a palette index keeps the link too', () => {
        const line = linked('word');
        line.color([0, 4], 196);
        const [segment] = line.getSegments();
        expect(segment.state?.foreground).toEqual({ space: 'indexed', index: 196 });
        expect(segment.state?.hyperlink).toBeDefined();
    });

    it('colorWords() keeps links', () => {
        const line = new AnsiAwareBuffer('take the ').appendBuffer(linked('gold')).append(' now');
        line.colorWords('gold', GOLD);
        const gold = line.getSegments().find(s => s.text === 'gold')!;
        expect(gold.state?.foreground).toEqual(GOLD.foreground);
        expect(gold.state?.hyperlink).toBeDefined();
    });

    it('applyFormat() merges with each piece, not with the first character', () => {
        // Red then green; a background over both must keep both foregrounds.
        const line = new AnsiAwareBuffer('red', { foreground: { space: 'hex', color: '#ff0000' } })
            .append('green', { foreground: { space: 'hex', color: '#00ff00' } });

        line.applyFormat([0, line.length], RED_BG);

        expect(describeSegments(line)).toEqual([
            ['red', '#ff0000', '#330000', false],
            ['green', '#00ff00', '#330000', false],
        ]);
    });

    it('applyFormat() does not stretch a link from the first character over the range', () => {
        const line = linked('ab').append('cd', {});
        line.applyFormat([0, 4], { bold: true });
        expect(describeSegments(line).map(s => [s[0], s[3]])).toEqual([['ab', true], ['cd', false]]);
        expect(line.getSegments().every(s => s.state?.bold)).toBe(true);
    });

    it('a field set to undefined is left alone; false turns a flag off', () => {
        const line = new AnsiAwareBuffer('x', { bold: true, italic: true, ...RED_BG });
        line.color([0, 1], { ...GOLD, bold: false, italic: undefined, background: undefined });
        const [segment] = line.getSegments();
        expect(segment.state?.bold).toBeFalsy();
        expect(segment.state?.italic).toBe(true);
        expect(segment.state?.background).toEqual(RED_BG.background);
        expect(segment.state?.foreground).toEqual(GOLD.foreground);
    });

    it('colouring changes no text, so trigger ranges stay where they were', () => {
        const original = 'a sword here';
        const line = new AnsiAwareBuffer(original).trackEditsFrom(original);
        line.prefix('[!] ');
        line.color([0, line.length], GOLD);
        expect(line.mapOriginalRange([2, 7])).toEqual([6, 11]);
        expect(line.text.slice(6, 11)).toBe('sword');
    });
});

describe('restyle', () => {
    it('replaces all formatting, links included, and keeps the text', () => {
        const line = new AnsiAwareBuffer('\x1b[44mblue\x1b[0m ').appendBuffer(linked('link'));
        line.restyle([0, line.length], GOLD);
        expect(line.text).toBe('blue link');
        expect(describeSegments(line)).toEqual([['blue link', '#ffd700', undefined, false]]);
    });

    it('restyle(range, {}) clears formatting', () => {
        const line = new AnsiAwareBuffer('x', { ...GOLD, bold: true });
        line.restyle([0, 1], {});
        expect(line.getSegments()).toEqual([{ text: 'x', state: undefined }]);
    });
});

describe('createLink', () => {
    it('keeps each piece\'s own colour and merges with an existing link', () => {
        const hover = vi.fn();
        const click = vi.fn();
        const line = new AnsiAwareBuffer('red', { foreground: { space: 'hex', color: '#ff0000' } })
            .append('green', { foreground: { space: 'hex', color: '#00ff00' } });
        line.createLink([0, 8], { onMouseEnter: hover, title: 'old' });
        line.createLink([0, 8], { onClick: click, title: 'new' });

        expect(describeSegments(line)).toEqual([
            ['red', '#ff0000', undefined, true],
            ['green', '#00ff00', undefined, true],
        ]);
        const link = line.getSegments()[1].state!.hyperlink!;
        expect(link.title).toBe('new');
        expect(link.onMouseEnter).toBe(hover);
        expect(link.onClick).toBe(click);
    });
});

describe('applyMudletColors', () => {
    it('colours only up to the next tag and keeps links', () => {
        const line = new AnsiAwareBuffer('<gold>').appendBuffer(linked('gold')).append('<reset> plain', {});
        line.applyMudletColors();
        expect(line.text).toBe('gold plain');
        const [gold, plain] = line.getSegments();
        expect(gold.text).toBe('gold');
        expect(gold.state?.foreground).toEqual({ space: 'rgb', r: 255, g: 215, b: 0 });
        expect(gold.state?.hyperlink).toBeDefined();
        expect(plain).toEqual({ text: ' plain', state: undefined });
    });

    it('a background tag keeps the foreground the text already has', () => {
        const line = new AnsiAwareBuffer('<bg:blue>text', { foreground: { space: 'hex', color: '#ff0000' } });
        line.applyMudletColors();
        const [segment] = line.getSegments();
        expect(segment.state?.foreground).toEqual({ space: 'hex', color: '#ff0000' });
        expect(segment.state?.background).toEqual({ space: 'rgb', r: 0, g: 0, b: 255 });
    });

    it('<reset> brings back the formatting the text came with', () => {
        const line = new AnsiAwareBuffer('\x1b[44m<red>a<reset>b\x1b[0m');
        line.applyMudletColors();
        const [a, b] = line.getSegments();
        expect(a.state?.foreground).toEqual({ space: 'rgb', r: 255, g: 0, b: 0 });
        expect(a.state?.background).toEqual(b.state?.background);
        expect(b.state?.foreground).toBeUndefined();
    });
});

describe('prefix / suffix', () => {
    it('are unformatted unless given a state, unlike prepend/append', () => {
        const line = linked('word');
        line.prefix('[').suffix(']');
        expect(describeSegments(line).map(s => [s[0], s[3]])).toEqual([['[', false], ['word', true], [']', false]]);
    });
});
