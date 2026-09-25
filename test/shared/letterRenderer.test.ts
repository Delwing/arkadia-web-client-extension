import {
    BUILTIN_LETTER_LAYOUTS,
    expandFillLine,
    getLayoutBodyWidth,
    renderLetter,
    renderLetterLayout,
    type LetterLayout,
} from '@shared/letterRenderer';

describe('expandFillLine', () => {
    it('repeats each {x} to the given width', () => {
        expect(expandFillLine(' +{-}+ ', 3)).toBe(' +---+ ');
        expect(expandFillLine('{ }|{=}', 2)).toBe('  |==');
    });

    it('repeats a multi-character pattern, cut to the exact width', () => {
        expect(expandFillLine('+{-=}+', 5)).toBe('+-=-=-+');
        expect(expandFillLine('<{~*~}>', 6)).toBe('<~*~~*~>');
    });

    it('leaves empty braces alone', () => {
        expect(expandFillLine('a{}b', 4)).toBe('a{}b');
    });

    it('leaves lines without fill tokens as they are', () => {
        expect(expandFillLine('  ~~~  ', 10)).toBe('  ~~~  ');
    });
});

describe('renderLetter (built-in templates)', () => {
    it('frames the body with the plain template', () => {
        expect(renderLetter('Ala ma kota', 'plain', 20).lines).toEqual([
            ' +----------------+ ',
            ' |                | ',
            ' |                | ',
            ' |  Ala ma kota   | ',
            ' |                | ',
            ' |                | ',
            ' +----------------+ ',
        ]);
    });

    it('keeps plain lines unpadded with no template', () => {
        const { lines } = renderLetter('Ala\n>Podpis', 'none', 20);
        expect(lines).toEqual(['Ala', '              Podpis']);
    });

    it('sends raw content untouched', () => {
        const content = '  a   b\n\n   c';
        expect(renderLetter(content, 'raw', 20).lines).toEqual(['  a   b', '', '   c']);
    });

    it('keeps the right border of Pergamin III in one column', () => {
        const { lines } = renderLetter('Ala ma kota', 'parchment3', 40);
        const borderColumns = lines.slice(2, 11).map(line => line.trimEnd().length - 1);
        expect(new Set(borderColumns).size).toBe(1);
        expect(lines.join('\n')).not.toMatch(/\\['`]/);
    });

    it('produces lines of the full width for framed templates', () => {
        for (const template of ['plain', 'parchment', 'parchment2'] as const) {
            const { lines } = renderLetter('Tresc listu, ktora zawija sie na kilka linii w ramce.', template, 40);
            const body = lines.filter(line => line.includes('Tresc'));
            expect(body[0].length).toBe(40);
        }
    });
});

describe('renderLetterLayout (custom layouts)', () => {
    const layout: LetterLayout = {
        header: ['*{=}*'],
        footer: ['*{=}*', '  koniec'],
        bodyPrefix: '* ',
        bodySuffix: ' *',
    };

    it('grows the frame with the line width', () => {
        const { lines, hasContent } = renderLetterLayout('Hej\n>Ja', layout, 12);
        expect(hasContent).toBe(true);
        expect(lines).toEqual([
            '*========*',
            '* Hej      *',
            '*       Ja *',
            '*========*',
            '  koniec',
        ]);
    });

    it('wraps content to the width left inside the frame', () => {
        const { lines } = renderLetterLayout('aaa bbb ccc', layout, 11);
        expect(lines.slice(1, -2)).toEqual(['* aaa bbb *', '* ccc     *']);
    });

    it('matches the built-in plain template when given its layout', () => {
        const content = 'Pierwsza linia\n\nDruga, dluzsza linia tekstu';
        expect(renderLetterLayout(content, BUILTIN_LETTER_LAYOUTS.plain, 30))
            .toEqual(renderLetter(content, 'plain', 30));
    });
});

describe('body alignment', () => {
    const text = 'aaa bbb ccc ddd eee';

    it('justifies the body by default, except the last line', () => {
        expect(renderLetter(text, 'none', 13).lines).toEqual(['aaa  bbb  ccc', 'ddd eee']);
    });

    it('aligns the whole body the chosen way', () => {
        expect(renderLetter(text, 'none', 13, 'left').lines).toEqual(['aaa bbb ccc', 'ddd eee']);
        expect(renderLetter(text, 'none', 13, 'right').lines).toEqual(['  aaa bbb ccc', '      ddd eee']);
        expect(renderLetter(text, 'none', 13, 'center').lines).toEqual([' aaa bbb ccc', '   ddd eee']);
    });

    it('aligns the text inside the frame', () => {
        const layout: LetterLayout = { header: ['+{-}+'], footer: ['+{-}+'], bodyPrefix: '|', bodySuffix: '|' };
        expect(renderLetterLayout('Tytul\n\nab', layout, 10, 'center').lines).toEqual([
            '+--------+',
            '| Tytul  |',
            '|        |',
            '|   ab   |',
            '+--------+',
        ]);
    });

    it('still right-aligns a line starting with >, including its wrapped part', () => {
        expect(renderLetter(`>${text}`, 'none', 13, 'left').lines).toEqual(['  aaa bbb ccc', '      ddd eee']);
    });

    it('leaves raw letters untouched', () => {
        expect(renderLetter(' a  b', 'raw', 20, 'center').lines).toEqual([' a  b']);
    });
});

describe('multi-line body prefix and suffix', () => {
    const layout: LetterLayout = {
        header: ['{-}'],
        footer: [],
        bodyPrefix: '(\n )\n',
        bodySuffix: ')\n(\n )',
    };

    it('repeats the pattern lines over the body lines', () => {
        const { lines } = renderLetterLayout('a\nb\nc\nd', layout, 7);
        expect(lines).toEqual([
            '---',
            '( a  )',
            ' )b  (',
            '( c   )',
            ' )d  )',
        ]);
    });

    it('fits the body into the widest prefix and suffix', () => {
        expect(getLayoutBodyWidth(layout, 10)).toBe(6);
    });
});
