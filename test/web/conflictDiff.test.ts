import {
    diffLines,
    expandJsonForDisplay,
    summarizeDiff,
} from '@web/options/conflictDiff';

describe('expandJsonForDisplay', () => {
    it('pretty-prints JSON with sorted keys', () => {
        const out = expandJsonForDisplay('{"b":1,"a":2}');
        expect(out).toBe('{\n  "a": 2,\n  "b": 1\n}');
    });

    it('recursively expands nested stringified JSON (e.g. triggers payload)', () => {
        const payload = JSON.stringify({ triggers: JSON.stringify([{ name: 'x', pattern: 'foo' }]) });
        const out = expandJsonForDisplay(payload);
        // The inner stringified array is unwrapped into real structure
        expect(out).toContain('"triggers": [');
        expect(out).toContain('"name": "x"');
        expect(out).not.toContain('\\"'); // no escaped quotes from a stringified blob
    });

    it('returns the raw string when input is not valid JSON', () => {
        expect(expandJsonForDisplay('not json')).toBe('not json');
    });

    it('produces identical output for objects that differ only in key order', () => {
        expect(expandJsonForDisplay('{"a":1,"b":2}')).toBe(expandJsonForDisplay('{"b":2,"a":1}'));
    });
});

describe('diffLines', () => {
    it('returns all-context when texts are identical', () => {
        const lines = diffLines('a\nb\nc', 'a\nb\nc');
        expect(lines.every(l => l.type === 'context')).toBe(true);
        expect(lines).toHaveLength(3);
    });

    it('marks a changed middle line as remove + add, keeping context', () => {
        const lines = diffLines('a\nb\nc', 'a\nX\nc');
        expect(lines).toEqual([
            { type: 'context', text: 'a' },
            { type: 'remove', text: 'b' },
            { type: 'add', text: 'X' },
            { type: 'context', text: 'c' },
        ]);
    });

    it('detects a pure addition', () => {
        const lines = diffLines('a\nc', 'a\nb\nc');
        expect(lines).toEqual([
            { type: 'context', text: 'a' },
            { type: 'add', text: 'b' },
            { type: 'context', text: 'c' },
        ]);
    });

    it('detects a pure removal', () => {
        const lines = diffLines('a\nb\nc', 'a\nc');
        expect(lines).toEqual([
            { type: 'context', text: 'a' },
            { type: 'remove', text: 'b' },
            { type: 'context', text: 'c' },
        ]);
    });

    it('treats one empty side as all additions / removals', () => {
        expect(diffLines('', 'x\ny')).toEqual([
            { type: 'add', text: 'x' },
            { type: 'add', text: 'y' },
        ]);
        expect(diffLines('x\ny', '')).toEqual([
            { type: 'remove', text: 'x' },
            { type: 'remove', text: 'y' },
        ]);
    });

    it('reconstructs the cloud text from context + add lines', () => {
        const before = 'one\ntwo\nthree';
        const after = 'one\ntwo-changed\nthree\nfour';
        const cloud = diffLines(before, after)
            .filter(l => l.type !== 'remove')
            .map(l => l.text)
            .join('\n');
        expect(cloud).toBe(after);
    });
});

describe('summarizeDiff', () => {
    it('counts additions and removals', () => {
        const lines = diffLines('a\nb\nc', 'a\nX\nY\nc');
        expect(summarizeDiff(lines)).toEqual({ added: 2, removed: 1 });
    });
});
