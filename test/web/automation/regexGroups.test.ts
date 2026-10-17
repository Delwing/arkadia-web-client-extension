import {
    groupColorClass,
    groupOfToken,
    groupPlaceholders,
    matchRanges,
    missingGroupWhy,
    patternGroups,
    textPieces,
    unknownArgTokens,
    unknownGroupTokens,
} from '@web/automation/regexGroups';
import { testTriggerPattern } from '@web/automation/automationPreview';

const spans = (pattern: string) => patternGroups(pattern).map(g => pattern.slice(g.start, g.end));

describe('regexGroups', () => {
    it('finds capture groups in order, with their depth and name', () => {
        const groups = patternGroups('^((\\w+) (?<cel>\\w+))$');
        expect(groups.map(g => [g.index, g.depth, g.name])).toEqual([[1, 0, undefined], [2, 1, undefined], [3, 1, 'cel']]);
        expect(spans('^((\\w+) (?<cel>\\w+))$')).toEqual(['((\\w+) (?<cel>\\w+))', '(\\w+)', '(?<cel>\\w+)']);
    });

    it('agrees with the regex engine on the number of groups', () => {
        for (const p of ['a(b)c', '(?:x)(y)', '\\((z)\\)', '[(](w)[)]', '(?=a)(b)(?<!c)', '(?<n>a)|(b)', '[\\]()](q)']) {
            const engine = new RegExp(`${p}|`).exec('')!.length - 1;
            expect(patternGroups(p), p).toHaveLength(engine);
        }
    });

    it('skips escaped brackets and ones in a character class', () => {
        expect(spans('\\(a\\) [()] (b)')).toEqual(['(b)']);
    });

    it('keeps an unclosed group to the end', () => {
        expect(patternGroups('ab(cd')[0]).toMatchObject({ start: 2, end: 5 });
    });

    it('nests the pieces along the groups', () => {
        expect(textPieces('x((a)b)y', patternGroups('x((a)b)y'))).toEqual([
            { text: 'x' },
            {
                group: expect.objectContaining({ index: 1 }),
                pieces: [{ text: '(' }, { group: expect.objectContaining({ index: 2 }), pieces: [{ text: '(a)' }] }, { text: 'b)' }],
            },
            { text: 'y' },
        ]);
    });

    it('cycles six colours', () => {
        expect([1, 6, 7, 13].map(groupColorClass)).toEqual(['automation-g1', 'automation-g6', 'automation-g1', 'automation-g1']);
    });

    it('nests groups that took the same text by number, and skips empty ones', () => {
        const groups = patternGroups('((a))(b?)');
        const [m] = testTriggerPattern('((a))(b?)', '', 'xa').matches;
        expect(textPieces('xa', matchRanges([m], groups))).toEqual([
            { text: 'x' },
            {
                group: expect.objectContaining({ index: 1 }),
                pieces: [{ group: expect.objectContaining({ index: 2 }), pieces: [{ text: 'a' }] }],
            },
        ]);
    });

    it('finds what each group took in every match', () => {
        const groups = patternGroups('(\\w)(?<d>\\d)');
        const { matches } = testTriggerPattern('(\\w)(?<d>\\d)', 'g', 'a1 b2');
        expect(matchRanges(matches, groups)).toEqual([
            { index: 1, name: undefined, start: 0, end: 1 },
            { index: 2, name: 'd', start: 1, end: 2 },
            { index: 1, name: undefined, start: 3, end: 4 },
            { index: 2, name: 'd', start: 4, end: 5 },
        ]);
    });

    it('offers a named group by number and by name, in one colour', () => {
        const [plain, named] = patternGroups('(a)(?<cel>b)');
        expect(groupPlaceholders([plain, named]).map(p => [p.token, p.className])).toEqual([
            ['$1', 'automation-g1'], ['$2', 'automation-g2'], ['{cel}', 'automation-g2'],
        ]);
        expect(groupOfToken('{2}', [plain, named])).toBe(named);
        expect(groupOfToken('$2', [plain, named])).toBe(named);
        expect(groupOfToken('{x}', [plain, named])).toBeUndefined();
    });

    it('flags tokens that point at no group, each once', () => {
        const groups = patternGroups('zab (\\w+) (?<cel>\\w+)');
        expect(unknownGroupTokens('zabij $1 $2 {cel} $0 {0}', groups)).toEqual([]);
        expect(unknownGroupTokens('zabij $3 {kto} $3 {4} $i', groups)).toEqual(['$3', '{kto}', '{4}']);
    });

    it('says how many groups the pattern has, in Polish plurals', () => {
        expect([0, 1, 2, 5, 22].map(missingGroupWhy)).toEqual([
            '- wzorzec nie ma grup w nawiasach.',
            '- wzorzec ma tylko 1 grupę.',
            '- wzorzec ma tylko 2 grupy.',
            '- wzorzec ma tylko 5 grup.',
            '- wzorzec ma tylko 22 grupy.',
        ]);
    });

    it('flags event fields the event does not carry', () => {
        expect(unknownArgTokens('{attacker} uderza {kto}', ['attacker', 'enemy'])).toEqual(['{kto}']);
    });
});
