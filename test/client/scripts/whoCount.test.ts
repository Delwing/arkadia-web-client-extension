import { parseKtoNames, sliceKtoBody } from '@client/scripts/whoCount';

describe('parseKtoNames', () => {
    describe('empty input', () => {
        it('should return empty array for empty string', () => {
            expect(parseKtoNames('')).toEqual([]);
        });

        it('should return empty array for whitespace-only string', () => {
            expect(parseKtoNames('   \n   \n  ')).toEqual([]);
        });
    });

    describe('long format (kto / kto l) — lines with commas', () => {
        it('should parse a single long-format entry', () => {
            const body = 'Kvendel z Twierdzy Karak Varn, Zbrojny Cechu Kupcow Novigradu, krasnolud\n';
            expect(parseKtoNames(body)).toEqual(['Kvendel']);
        });

        it('should parse multiple long-format entries', () => {
            const body = [
                'Zorlan Vethis, Kaznodzieja Bractwa Reki Stworzenia, mezczyzna',
                'Kvendel z Twierdzy Karak Varn, Zbrojny Cechu Kupcow Novigradu, krasnolud',
                'Thimrak ze Wzgorz, Czarodziej Przymierza Magii, czlowiek',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Kvendel', 'Thimrak']);
        });

        it('should skip indented continuation lines (the bug case — multi-line entry with trailing whitespace)', () => {
            // The bug: "Zorlan Vethis, ...Lubieznikiem,     \n      mezczyzna" was previously
            // parsed incorrectly. The indented second line must be skipped.
            const body = [
                'Zorlan Vethis, Kaznodzieja Bractwa Reki Stworzenia, Patronem jest Lubieznikiem,     ',
                '      mezczyzna',
                'Kvendel z Twierdzy Karak Varn, Zbrojny Cechu Kupcow Novigradu, krasnolud',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Kvendel']);
        });

        it('should skip lines ending with a period (footer/summary lines)', () => {
            const body = [
                'Zorlan Vethis, Kaznodzieja Bractwa, mezczyzna',
                'Widzisz 5 znanych tobie postaci.',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Zorlan']);
        });

        it('should skip lines without a comma (e.g. standalone description lines)', () => {
            const body = [
                'Zorlan Vethis, Kaznodzieja Bractwa, mezczyzna',
                'tylko opis bez przecinka',
                'Kvendel z Twierdzy, krasnolud',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Kvendel']);
        });

        it('should strip leading asterisk from name', () => {
            const body = '*Zorlan Vethis, Kaznodzieja Bractwa, mezczyzna\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan']);
        });

        it('should strip trailing asterisk from name', () => {
            // Trailing asterisk on the first word (e.g. "Zorlan*")
            const body = 'Zorlan* Vethis, Kaznodzieja Bractwa, mezczyzna\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan']);
        });

        it('should strip leading asterisk on entry with multiple description fields', () => {
            const body = [
                '*Kvendel z Twierdzy Karak Varn, Zbrojny Cechu Kupcow Novigradu, krasnolud',
                '*Thimrak ze Wzgorz, Czarodziej Przymierza Magii, czlowiek',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Kvendel', 'Thimrak']);
        });

        it('should not include empty first words', () => {
            // A line that starts with a space would be skipped by the indentation check
            // but a truly blank line should also yield nothing
            const body = '\nZorlan Vethis, Kaznodzieja, mezczyzna\n\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan']);
        });

        it('should handle a real-world kto body with mixed indented continuation lines', () => {
            const body = [
                'Zorlan Vethis, Kaznodzieja Bractwa Reki Stworzenia, Patronem jest Bogiem,   ',
                '      mezczyzna',
                'Norvath z Krolestwa Novigrad, Obywatel Cechu Kupcow Novigradu,   ',
                '      czlowiek',
                'Thimrak ze Wzgorz, Czarodziej Przymierza Magii, czlowiek',
                'Widzisz 3 znanych tobie postaci.',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Norvath', 'Thimrak']);
        });
    });

    describe('short format (kto k) — column layout without commas', () => {
        it('should parse a single row with one name', () => {
            const body = 'Zorlan\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan']);
        });

        it('should parse names separated by two or more spaces on a single row', () => {
            const body = 'Zorlan         Norvath        Thimrak\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Norvath', 'Thimrak']);
        });

        it('should parse names across multiple rows', () => {
            const body = [
                'Zorlan         Norvath        Thimrak',
                'Perlwyn        Ulmiros',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Norvath', 'Thimrak', 'Perlwyn', 'Ulmiros']);
        });

        it('should skip blank lines between rows', () => {
            const body = 'Zorlan         Norvath\n\nThimrak        Perlwyn\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Norvath', 'Thimrak', 'Perlwyn']);
        });

        it('should strip leading asterisk from a short-format name', () => {
            const body = '*Zorlan         Norvath\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Norvath']);
        });

        it('should strip trailing asterisk from a short-format name', () => {
            const body = 'Zorlan*        Norvath\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Norvath']);
        });

        it('should handle names separated by exactly two spaces', () => {
            // Two spaces is the minimum required by the 2+ split
            const body = 'Zorlan  Norvath\n';
            expect(parseKtoNames(body)).toEqual(['Zorlan', 'Norvath']);
        });

        it('should not split names separated by only a single space', () => {
            // A single space is NOT a column separator in short format
            const body = 'Zorlan Norvath\n';
            // Treated as one "name" token since no 2+ spaces
            expect(parseKtoNames(body)).toEqual(['Zorlan Norvath']);
        });
    });

    describe('format detection (long vs short)', () => {
        it('should use long format when body contains a comma', () => {
            // A body containing a comma triggers long-format parsing
            const body = 'Zorlan Vethis, Kaznodzieja Bractwa, mezczyzna\n';
            const result = parseKtoNames(body);
            // Long-format: extracts only first word
            expect(result).toEqual(['Zorlan']);
            expect(result).not.toContain('Vethis,');
        });

        it('should use short format when body contains no comma', () => {
            const body = 'Zorlan         Norvath        Thimrak\n';
            const result = parseKtoNames(body);
            expect(result).toEqual(['Zorlan', 'Norvath', 'Thimrak']);
        });

        it('should produce the same set of names for long and short format of the same people', () => {
            const longBody = [
                'Zorlan Vethis, Kaznodzieja, mezczyzna',
                'Norvath Stary, Obywatel Cechu, czlowiek',
                'Thimrak ze Wzgorz, Czarodziej, czlowiek',
            ].join('\n');

            const shortBody = 'Zorlan         Norvath        Thimrak\n';

            const longNames = parseKtoNames(longBody).sort();
            const shortNames = parseKtoNames(shortBody).sort();
            expect(longNames).toEqual(shortNames);
        });
    });
});

describe('sliceKtoBody', () => {
    it('should keep the whole body when nothing else shared the frame', () => {
        const body = [
            'Zorlan     Brackov    Yendrel',
            'Drevos     Halven     Corvath',
        ].join('\n');
        expect(sliceKtoBody(body)).toBe(body);
    });

    it('should cut at unrelated output flushed into the same frame', () => {
        const body = [
            'Zorlan     Brackov    Yendrel    Xolmir     Fenwar     Astrilo',
            'Drevos     Halven     Corvath    Wexlin     Melgrath   ',
            'Wraz z Wexlinem i dojrzalym malomownym mezczyzna jedziesz duzym dwuosiowym dylizansem na poludniowy-wschod.',
        ].join('\n');
        expect(sliceKtoBody(body)).toBe([
            'Zorlan     Brackov    Yendrel    Xolmir     Fenwar     Astrilo',
            'Drevos     Halven     Corvath    Wexlin     Melgrath   ',
        ].join('\n'));
    });

    it('should cut at a footer/summary line', () => {
        const body = [
            'Zorlan Vethis, Kaznodzieja Bractwa, mezczyzna',
            'Widzisz 5 znanych tobie postaci.',
        ].join('\n');
        expect(sliceKtoBody(body)).toBe('Zorlan Vethis, Kaznodzieja Bractwa, mezczyzna');
    });

    it('should drop everything when the very first body line is unrelated', () => {
        expect(sliceKtoBody('Kot siedzi.\nZorlan   Norvath')).toBe('');
    });

    it('should leave a name that never gets sliced intact', () => {
        // The cut is per line, not per character: a period late in a line still
        // discards that whole line rather than half of it.
        expect(sliceKtoBody('Zorlan   Norvath\nCos sie stalo. I jeszcze cos')).toBe('Zorlan   Norvath');
    });
});
