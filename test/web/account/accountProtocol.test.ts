import {
    adjectivesFor,
    decodeGameText,
    describeInstrumental,
    encodeGamePayload,
    generateName,
    isValidEmail,
    isValidName,
    normalizeInfo,
    normalizeOptions,
    pickTwoAdjectives,
    startlocLocative,
} from '@web/account/accountProtocol.ts';

/** "zażółć" as the game sends it: its UTF-8 bytes, one char each. */
const asGameBytes = (text: string) => String.fromCharCode(...new TextEncoder().encode(text));

describe('accountProtocol', () => {
    it('decodes the UTF-8 bytes GMCP strings arrive as, leaving plain text alone', () => {
        expect(decodeGameText(asGameBytes('Żadne konto nie jest przypisane'))).toBe('Żadne konto nie jest przypisane');
        expect(decodeGameText('plain ascii')).toBe('plain ascii');
        expect(decodeGameText('już zdekodowane ż')).toBe('już zdekodowane ż');
        expect(decodeGameText(undefined)).toBe('');
    });

    it('encodes a request as the UTF-8 bytes of its JSON', () => {
        const encoded = encodeGamePayload({adjectives: ['łysy']});
        expect(decodeGameText(encoded)).toBe('{"adjectives":["łysy"]}');
        expect([...encoded].every((c) => c.charCodeAt(0) < 256)).toBe(true);
    });

    it('takes names of plain letters and e-mails of printable ASCII', () => {
        expect(isValidName('Dargoth')).toBe(true);
        expect(isValidName('Żaneta')).toBe(false);
        expect(isValidName('Ab1')).toBe(false);
        expect(isValidEmail('a@b.pl')).toBe(true);
        expect(isValidEmail('ab.pl')).toBe(false);
        expect(isValidEmail('ż@b.pl')).toBe(false);
    });

    const options = normalizeOptions({
        races: [{val: 0, text: 'człowiek'}, {val: 1, text: 'elf'}],
        genders: [{val: 0, text: 'mężczyzna'}, {val: 1, text: 'kobieta'}],
        startlocs: [{val: 0, text: 'novigrad'}, {val: 1, text: 'nuln'}],
        attributes: [
            {val: 'wysoki', text: 'wysoki', bit: 0b0011, group: 'wzrost'},
            {val: 'brodaty', text: 'brodaty', bit: 0b0001, group: 'twarz'},
            {val: 'smukly', text: 'smukly', bit: 0b1100, group: 'budowa'},
            {val: 'zgrabny', text: 'zgrabny', bit: 0b1000, group: 'budowa'},
        ],
    });

    it('offers each race and gender only the adjectives its bits allow', () => {
        expect(adjectivesFor(options, 0, 0).map((a) => a.val)).toEqual(['brodaty', 'wysoki']);
        expect(adjectivesFor(options, 0, 1).map((a) => a.val)).toEqual(['wysoki']);
        expect(adjectivesFor(options, 1, 0).map((a) => a.val)).toEqual(['smukly']);
        expect(adjectivesFor(options, 1, 1).map((a) => a.val)).toEqual(['smukly', 'zgrabny']);
    });

    it("gives a woman's adjectives their feminine ending", () => {
        expect(adjectivesFor(options, 1, 1).map((a) => a.text)).toEqual(['Smukla', 'Zgrabna']);
        expect(adjectivesFor(options, 0, 0).map((a) => a.text)).toEqual(['Brodaty', 'Wysoki']);
    });

    it('picks two different adjectives', () => {
        const list = adjectivesFor(options, 1, 1);
        for (const r of [0, 0.4, 0.99]) {
            const [a, b] = pickTwoAdjectives(list, () => r);
            expect(a).not.toBe(b);
        }
    });

    it('sums the character up in the instrumental', () => {
        expect(describeInstrumental('elf', 0, 'wysoki', 'smukly')).toBe('wysokim smuklym elfem');
        expect(describeInstrumental('elf', 1, 'wysoki', 'smukly')).toBe('wysoką smuklą elfką');
        expect(describeInstrumental('człowiek', 1, 'wysoki', 'smukly')).toBe('wysoką smuklą kobietą');
        expect(startlocLocative('nuln')).toBe('Nuln');
        expect(startlocLocative('novigrad')).toBe('Novigradzie');
    });

    it('generates names from the race parts, humans for anything unknown', () => {
        expect(generateName('elf', () => 0)).toBe('Aesalion');
        expect(generateName('człowiek', () => 0)).toBe('Abgart');
        expect(isValidName(generateName('ogr'))).toBe(true);
    });

    it('normalizes account.info, blocked flags included', () => {
        const info = normalizeInfo({email: 'a@b.pl', chars: [{name: 'dargoth', blocked: 1}, {name: 'xen'}, {bad: true}]});
        expect(info.chars).toEqual([{name: 'dargoth', blocked: true}, {name: 'xen', blocked: false}]);
        expect(info.email).toBe('a@b.pl');
    });
});
