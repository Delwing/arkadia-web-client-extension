import {
    clearSyncActivity,
    getSyncActivity,
    logSyncActivity,
    onSyncActivity,
} from '@modules/firebase/syncActivityLog';

describe('syncActivityLog', () => {
    afterEach(() => clearSyncActivity());

    it('keeps entries oldest first and notifies listeners', () => {
        const seen: number[] = [];
        const unsubscribe = onSyncActivity(entries => seen.push(entries.length));

        logSyncActivity('info', 'first', 1);
        logSyncActivity('error', 'second', 2);

        expect(getSyncActivity().map(e => e.text)).toEqual(['first', 'second']);
        expect(getSyncActivity()[1]).toMatchObject({ level: 'error', at: 2 });
        expect(seen).toEqual([1, 2]);

        unsubscribe();
        logSyncActivity('info', 'third');
        expect(seen).toEqual([1, 2]);
    });

    it('keeps only the latest 100 entries', () => {
        for (let i = 0; i < 120; i++) logSyncActivity('info', `entry ${i}`);
        const entries = getSyncActivity();
        expect(entries).toHaveLength(100);
        expect(entries[0].text).toBe('entry 20');
        expect(entries[99].text).toBe('entry 119');
    });

    it('clears', () => {
        logSyncActivity('info', 'x');
        clearSyncActivity();
        expect(getSyncActivity()).toEqual([]);
    });
});
