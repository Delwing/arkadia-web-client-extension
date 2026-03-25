import { parseKtoNames } from '@client/scripts/whoCount';

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
            const body = 'Barag z Twierdzy Karak Varn, Zbrojny Cechu Kupcow Novigradu, krasnolud\n';
            expect(parseKtoNames(body)).toEqual(['Barag']);
        });

        it('should parse multiple long-format entries', () => {
            const body = [
                'Agis Jaeger, Kaznodzieja Bractwa Reki Stworzenia, mezczyzna',
                'Barag z Twierdzy Karak Varn, Zbrojny Cechu Kupcow Novigradu, krasnolud',
                'Froon ze Wzgorz, Czarodziej Przymierza Magii, czlowiek',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Agis', 'Barag', 'Froon']);
        });

        it('should skip indented continuation lines (the bug case — multi-line entry with trailing whitespace)', () => {
            // The bug: "Agis Jaeger, ...Lubieznikiem,     \n      mezczyzna" was previously
            // parsed incorrectly. The indented second line must be skipped.
            const body = [
                'Agis Jaeger, Kaznodzieja Bractwa Reki Stworzenia, Patronem jest Lubieznikiem,     ',
                '      mezczyzna',
                'Barag z Twierdzy Karak Varn, Zbrojny Cechu Kupcow Novigradu, krasnolud',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Agis', 'Barag']);
        });

        it('should skip lines ending with a period (footer/summary lines)', () => {
            const body = [
                'Agis Jaeger, Kaznodzieja Bractwa, mezczyzna',
                'Widzisz 5 znanych tobie postaci.',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Agis']);
        });

        it('should skip lines without a comma (e.g. standalone description lines)', () => {
            const body = [
                'Agis Jaeger, Kaznodzieja Bractwa, mezczyzna',
                'tylko opis bez przecinka',
                'Barag z Twierdzy, krasnolud',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Agis', 'Barag']);
        });

        it('should strip leading asterisk from name', () => {
            const body = '*Agis Jaeger, Kaznodzieja Bractwa, mezczyzna\n';
            expect(parseKtoNames(body)).toEqual(['Agis']);
        });

        it('should strip trailing asterisk from name', () => {
            // Trailing asterisk on the first word (e.g. "Agis*")
            const body = 'Agis* Jaeger, Kaznodzieja Bractwa, mezczyzna\n';
            expect(parseKtoNames(body)).toEqual(['Agis']);
        });

        it('should strip leading asterisk on entry with multiple description fields', () => {
            const body = [
                '*Barag z Twierdzy Karak Varn, Zbrojny Cechu Kupcow Novigradu, krasnolud',
                '*Froon ze Wzgorz, Czarodziej Przymierza Magii, czlowiek',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Barag', 'Froon']);
        });

        it('should not include empty first words', () => {
            // A line that starts with a space would be skipped by the indentation check
            // but a truly blank line should also yield nothing
            const body = '\nAgis Jaeger, Kaznodzieja, mezczyzna\n\n';
            expect(parseKtoNames(body)).toEqual(['Agis']);
        });

        it('should handle a real-world kto body with mixed indented continuation lines', () => {
            const body = [
                'Agis Jaeger, Kaznodzieja Bractwa Reki Stworzenia, Patronem jest Bogiem,   ',
                '      mezczyzna',
                'Bilonk z Krolestwa Novigrad, Obywatel Cechu Kupcow Novigradu,   ',
                '      czlowiek',
                'Froon ze Wzgorz, Czarodziej Przymierza Magii, czlowiek',
                'Widzisz 3 znanych tobie postaci.',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Agis', 'Bilonk', 'Froon']);
        });
    });

    describe('short format (kto k) — column layout without commas', () => {
        it('should parse a single row with one name', () => {
            const body = 'Agis\n';
            expect(parseKtoNames(body)).toEqual(['Agis']);
        });

        it('should parse names separated by two or more spaces on a single row', () => {
            const body = 'Agis           Bilonk         Froon\n';
            expect(parseKtoNames(body)).toEqual(['Agis', 'Bilonk', 'Froon']);
        });

        it('should parse names across multiple rows', () => {
            const body = [
                'Agis           Bilonk         Froon',
                'Graahl         Xarion',
            ].join('\n');
            expect(parseKtoNames(body)).toEqual(['Agis', 'Bilonk', 'Froon', 'Graahl', 'Xarion']);
        });

        it('should skip blank lines between rows', () => {
            const body = 'Agis           Bilonk\n\nFroon          Graahl\n';
            expect(parseKtoNames(body)).toEqual(['Agis', 'Bilonk', 'Froon', 'Graahl']);
        });

        it('should strip leading asterisk from a short-format name', () => {
            const body = '*Agis          Bilonk\n';
            expect(parseKtoNames(body)).toEqual(['Agis', 'Bilonk']);
        });

        it('should strip trailing asterisk from a short-format name', () => {
            const body = 'Agis*          Bilonk\n';
            expect(parseKtoNames(body)).toEqual(['Agis', 'Bilonk']);
        });

        it('should handle names separated by exactly two spaces', () => {
            // Two spaces is the minimum required by the 2+ split
            const body = 'Agis  Bilonk\n';
            expect(parseKtoNames(body)).toEqual(['Agis', 'Bilonk']);
        });

        it('should not split names separated by only a single space', () => {
            // A single space is NOT a column separator in short format
            const body = 'Agis Bilonk\n';
            // Treated as one "name" token since no 2+ spaces
            expect(parseKtoNames(body)).toEqual(['Agis Bilonk']);
        });
    });

    describe('format detection (long vs short)', () => {
        it('should use long format when body contains a comma', () => {
            // A body containing a comma triggers long-format parsing
            const body = 'Agis Jaeger, Kaznodzieja Bractwa, mezczyzna\n';
            const result = parseKtoNames(body);
            // Long-format: extracts only first word
            expect(result).toEqual(['Agis']);
            expect(result).not.toContain('Jaeger,');
        });

        it('should use short format when body contains no comma', () => {
            const body = 'Agis           Bilonk         Froon\n';
            const result = parseKtoNames(body);
            expect(result).toEqual(['Agis', 'Bilonk', 'Froon']);
        });

        it('should produce the same set of names for long and short format of the same people', () => {
            const longBody = [
                'Agis Jaeger, Kaznodzieja, mezczyzna',
                'Bilonk Stary, Obywatel Cechu, czlowiek',
                'Froon ze Wzgorz, Czarodziej, czlowiek',
            ].join('\n');

            const shortBody = 'Agis           Bilonk         Froon\n';

            const longNames = parseKtoNames(longBody).sort();
            const shortNames = parseKtoNames(shortBody).sort();
            expect(longNames).toEqual(shortNames);
        });
    });
});
