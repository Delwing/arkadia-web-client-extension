import { getRecentLines, recordRecentLine } from '@modules/core/recentLines';

describe('recentLines', () => {
    it('keeps the last lines with their type, skipping blank ones', () => {
        recordRecentLine('   ', '');
        for (let i = 0; i < 105; i++) recordRecentLine(`linia ${i}`, i % 2 ? 'comm' : '');
        const lines = getRecentLines();
        expect(lines).toHaveLength(100);
        expect(lines[0]).toEqual({ text: 'linia 5', type: 'comm' });
        expect(lines[99]).toEqual({ text: 'linia 104', type: '' });
    });
});
