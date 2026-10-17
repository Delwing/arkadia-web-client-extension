import { expandAliasCommand } from '@client/scripts/userAliases';
import { PATTERN_SNIPPETS, escapeRegex, nextGroupIndex, patternFromText } from '@web/automation/patternSnippets';

const snippet = (id: string) => PATTERN_SNIPPETS.find(s => s.id === id)!;

/** Applies a snippet to `value` with `[` `]` marking the selection (or `|` the caret); returns it marked the same way. */
function apply(id: string, marked: string): string {
    const caret = marked.indexOf('|');
    const start = caret >= 0 ? caret : marked.indexOf('[');
    const end = caret >= 0 ? caret : marked.indexOf(']') - 1;
    const value = marked.replace(/[|[\]]/g, '');
    const r = snippet(id).apply(value, start, end);
    return r.selStart === r.selEnd
        ? r.value.slice(0, r.selStart) + '|' + r.value.slice(r.selStart)
        : `${r.value.slice(0, r.selStart)}[${r.value.slice(r.selStart, r.selEnd)}]${r.value.slice(r.selEnd)}`;
}

describe('patternSnippets', () => {
    it('replaces the selection with a capture and leaves the caret after it', () => {
        expect(apply('word', 'zab [goblina]')).toBe('zab ([\\w-]+)|');
        expect(apply('textUntil', '^[Wysoki elf] atakuje cie')).toBe('^(.+?)| atakuje cie');
        expect(apply('number', 'kok |')).toBe('kok (\\d+)|');
    });

    it('lets the word capture take hyphenated descriptions', () => {
        expect(new RegExp(`^${snippet('word').shown}$`).test('bialo-kremowa')).toBe(true);
    });

    it('names a group with its name selected to type over', () => {
        expect(apply('named', 'zab [goblina]')).toBe('zab (?<[nazwa]>goblina)');
        expect(apply('named', 'zab |')).toBe('zab (?<[nazwa]>.+)');
    });

    it('wraps the selection in an alternative or an optional piece', () => {
        expect(apply('oneOf', '[atakuje] cie')).toBe('(?:atakuje||) cie');
        expect(apply('oneOf', '| cie')).toBe('(?:||) cie');
        expect(apply('optional', 'cie[ mocno]')).toBe('cie(?: mocno)?|');
    });

    it('anchors the line once', () => {
        expect(apply('lineStart', 'ab|c')).toBe('^ab|c');
        expect(apply('lineStart', '^ab|c')).toBe('^ab|c');
        expect(apply('lineEnd', 'a|bc')).toBe('a|bc$');
        expect(apply('lineEnd', 'a|bc$')).toBe('a|bc$');
        expect(apply('lineEnd', 'kosztuje 5\\$|')).toBe('kosztuje 5\\$|$');
    });

    it('ends with an escaped dot, replacing a bare one or an anchor', () => {
        expect(apply('dotEnd', 'atakuje cie|')).toBe('atakuje cie|\\.$');
        expect(apply('dotEnd', 'atakuje cie.|')).toBe('atakuje cie|\\.$');
        expect(apply('dotEnd', 'atakuje cie|$')).toBe('atakuje cie|\\.$');
        expect(apply('dotEnd', 'atakuje cie\\.$|')).toBe('atakuje cie|\\.$');
    });

    it('knows which number the inserted group gets', () => {
        expect(nextGroupIndex('(a) | (b)', 4)).toBe(2);
        expect(nextGroupIndex('(a) | (b)', 0)).toBe(1);
        expect(nextGroupIndex('(?:a) |', 6)).toBe(1);
    });

    it('turns a line into a pattern that matches it', () => {
        const line = 'Wysoki elf (ranny) atakuje cie.';
        const pattern = patternFromText(` ${line} `, true);
        expect(pattern).toBe('^Wysoki elf \\(ranny\\) atakuje cie\\.$');
        expect(new RegExp(pattern).test(line)).toBe(true);
        expect(patternFromText('zab goblina', false)).toBe('zab goblina');
        expect(escapeRegex('a+b?')).toBe('a\\+b\\?');
    });

    it('captures exactly the three words of a short description', () => {
        const m = 'Wysoki muskularny elf atakuje cie.'.match(new RegExp(`^${snippet('short').shown} atakuje cie\\.$`));
        expect(m?.[1]).toBe('Wysoki muskularny elf');
        expect(new RegExp(`^${snippet('short').shown}$`).test('bialo-kremowa smocza fajka')).toBe(true);
        expect(new RegExp(`^${snippet('short').shown}$`).test('wysoki elf')).toBe(false);
    });

    it('captures a range that $i repeats over, offered only in aliases', () => {
        const range = snippet('range');
        expect(range.only).toBe('alias');
        const m = 'kok 1-3'.match(new RegExp(`^kok ${range.shown}$`))!;
        expect(expandAliasCommand('rozerwij $i. kokon', m)).toEqual(['rozerwij 1. kokon', 'rozerwij 2. kokon', 'rozerwij 3. kokon']);
        expect(new RegExp(`^${range.shown}$`).test('7')).toBe(true);
        expect(PATTERN_SNIPPETS.filter(s => s.kind === 'anchor').every(s => s.only === 'trigger')).toBe(true);
    });

    it('keeps every pattern ASCII', () => {
        for (const s of PATTERN_SNIPPETS) expect(s.shown, s.id).toMatch(/^[\x20-\x7e]+$/);
    });
});
