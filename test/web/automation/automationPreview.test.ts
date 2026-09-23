import {
    groupCount,
    matchGroups,
    previewAlias,
    previewTrigger,
    testAliasPattern,
    testTriggerPattern,
} from '@web/automation/automationPreview';

describe('automationPreview', () => {
    describe('testTriggerPattern', () => {
        it('finds the first match and its groups', () => {
            const { matches } = testTriggerPattern('^(\\w+) atakuje cie', '', 'Goblin atakuje cie!');
            expect(matches).toHaveLength(1);
            expect(matchGroups(matches[0])).toEqual([{ token: '$1', value: 'Goblin' }]);
        });

        it('ignores case only with the i flag', () => {
            expect(testTriggerPattern('goblin', '', 'GOBLIN').matches).toHaveLength(0);
            expect(testTriggerPattern('goblin', 'i', 'GOBLIN').matches).toHaveLength(1);
        });

        it('finds every match only with the g flag', () => {
            expect(testTriggerPattern('a', '', 'a a a').matches).toHaveLength(1);
            expect(testTriggerPattern('a', 'g', 'a a a').matches).toHaveLength(3);
        });

        it('reports a pattern that does not compile', () => {
            const result = testTriggerPattern('(', '', 'x');
            expect(result.error).toBeTruthy();
            expect(result.matches).toEqual([]);
        });
    });

    it('matches an alias against the whole command', () => {
        expect(testAliasPattern('zab (.+)', 'zab goblina').matches).toHaveLength(1);
        expect(testAliasPattern('zab', 'zabij').matches).toHaveLength(0);
    });

    it('counts capture groups', () => {
        expect(groupCount('zab (.+) (\\d+)')).toBe(2);
        expect(groupCount('zab')).toBe(0);
        expect(groupCount('(')).toBe(0);
    });

    describe('previewTrigger', () => {
        const [match] = testTriggerPattern('^(\\w+) atakuje cie', '', 'Goblin atakuje cie!').matches;

        it('applies the line actions to the matched part', () => {
            const { segments } = previewTrigger('Goblin atakuje cie!', [match], [
                { type: 'color', color: '#ff0000' },
                { type: 'uppercase' },
            ]);
            expect(segments).toEqual([
                { text: 'GOBLIN ATAKUJE CIE', match: true, color: '#ff0000' },
                { text: '!' },
            ]);
        });

        it('fills $1 and falls back to the matched text for an empty message', () => {
            const { outputs } = previewTrigger('Goblin atakuje cie!', [match], [
                { type: 'command', command: 'zabij $1' },
                { type: 'notify', message: '' },
                { type: 'speak', message: 'Atak: {1}' },
            ]);
            expect(outputs).toEqual([
                { kind: 'command', text: 'zabij Goblin' },
                { kind: 'notify', text: 'Goblin atakuje cie' },
                { kind: 'speak', text: 'Atak: Goblin' },
            ]);
        });

        it('wraps the whole line for a line-scoped wrap', () => {
            const { segments } = previewTrigger('Goblin atakuje cie!', [match], [
                { type: 'wrap', wrapPrefix: '[', wrapSuffix: ']', wrapScope: 'line' },
            ]);
            expect(segments.map(s => s.text).join('')).toBe('[Goblin atakuje cie!]');
        });
    });

    describe('previewAlias', () => {
        const [match] = testAliasPattern('kok (.+)', 'kok 1-2').matches;

        it('expands ranges and splits commands', () => {
            expect(previewAlias(match, [{ type: 'command', command: 'rozerwij $i. kokon;spojrz' }])).toEqual([
                { kind: 'command', text: 'rozerwij 1. kokon' },
                { kind: 'command', text: 'spojrz' },
                { kind: 'command', text: 'rozerwij 2. kokon' },
                { kind: 'command', text: 'spojrz' },
            ]);
        });

        it('shows a character override once in place of the commands', () => {
            const outputs = previewAlias(match, [
                { type: 'command', command: 'a' },
                { type: 'notify', message: 'kokony $1' },
                { type: 'command', command: 'b' },
            ], 'inaczej');
            expect(outputs).toEqual([
                { kind: 'command', text: 'inaczej' },
                { kind: 'notify', text: 'kokony 1-2' },
            ]);
        });

        it('skips a message action without text', () => {
            expect(previewAlias(match, [{ type: 'notify', message: '' }])).toEqual([]);
        });
    });
});
