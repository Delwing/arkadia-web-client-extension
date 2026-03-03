import { mergeProfessionStates, type ProfessionState } from '@client/scripts/profession';

describe('mergeProfessionStates', () => {
    it('returns null when both inputs are null', () => {
        expect(mergeProfessionStates(null, null)).toBeNull();
    });

    it('returns cloud when local is null', () => {
        const cloud: ProfessionState = { start_time: 1000, plus_events: [1001, 1002] };
        expect(mergeProfessionStates(null, cloud)).toEqual(cloud);
    });

    it('returns local when cloud is null', () => {
        const local: ProfessionState = { start_time: 1000, plus_events: [1001, 1002] };
        expect(mergeProfessionStates(local, null)).toEqual(local);
    });

    it('merges two disjoint event arrays', () => {
        const local: ProfessionState = { start_time: 1000, plus_events: [1001, 1002, 1003] };
        const cloud: ProfessionState = { start_time: 1000, plus_events: [2001, 2002] };
        const merged = mergeProfessionStates(local, cloud)!;
        expect(merged.start_time).toBe(1000);
        expect(merged.plus_events).toEqual([1001, 1002, 1003, 2001, 2002]);
    });

    it('deduplicates overlapping events', () => {
        const local: ProfessionState = { start_time: 1000, plus_events: [1001, 1002, 1003] };
        const cloud: ProfessionState = { start_time: 1000, plus_events: [1002, 1003, 1004] };
        const merged = mergeProfessionStates(local, cloud)!;
        expect(merged.plus_events).toEqual([1001, 1002, 1003, 1004]);
    });

    it('handles identical event arrays', () => {
        const local: ProfessionState = { start_time: 1000, plus_events: [1001, 1002] };
        const cloud: ProfessionState = { start_time: 1000, plus_events: [1001, 1002] };
        const merged = mergeProfessionStates(local, cloud)!;
        expect(merged.plus_events).toEqual([1001, 1002]);
    });

    it('takes the earlier start_time', () => {
        const local: ProfessionState = { start_time: 2000, plus_events: [2001] };
        const cloud: ProfessionState = { start_time: 1000, plus_events: [1001] };
        const merged = mergeProfessionStates(local, cloud)!;
        expect(merged.start_time).toBe(1000);
    });

    it('returns sorted events', () => {
        const local: ProfessionState = { start_time: 1000, plus_events: [3000, 1000] };
        const cloud: ProfessionState = { start_time: 1000, plus_events: [2000, 4000] };
        const merged = mergeProfessionStates(local, cloud)!;
        expect(merged.plus_events).toEqual([1000, 2000, 3000, 4000]);
    });

    it('migrates legacy format (plus_points) from local', () => {
        const local = { start_time: 1000, plus_points: 9 }; // 9 / 3 = 3 events
        const cloud: ProfessionState = { start_time: 1000, plus_events: [2001, 2002] };
        const merged = mergeProfessionStates(local, cloud)!;
        // Legacy generates synthetic events at start_time+1, +2, +3
        expect(merged.plus_events).toEqual([1001, 1002, 1003, 2001, 2002]);
    });

    it('migrates legacy format from cloud', () => {
        const local: ProfessionState = { start_time: 1000, plus_events: [2001] };
        const cloud = { start_time: 1000, plus_points: 6 }; // 6 / 3 = 2 events
        const merged = mergeProfessionStates(local, cloud)!;
        expect(merged.plus_events).toEqual([1001, 1002, 2001]);
    });

    it('migrates legacy format from both sides', () => {
        const local = { start_time: 1000, plus_points: 6 };
        const cloud = { start_time: 1000, plus_points: 6 };
        const merged = mergeProfessionStates(local, cloud)!;
        // Same legacy data produces identical synthetic events -> deduplicated
        expect(merged.plus_events).toEqual([1001, 1002]);
    });

    it('handles legacy with zero points', () => {
        const local = { start_time: 1000, plus_points: 0 };
        const cloud: ProfessionState = { start_time: 1000, plus_events: [2001] };
        const merged = mergeProfessionStates(local, cloud)!;
        expect(merged.plus_events).toEqual([2001]);
    });

    it('handles empty plus_events arrays', () => {
        const local: ProfessionState = { start_time: 1000, plus_events: [] };
        const cloud: ProfessionState = { start_time: 1000, plus_events: [] };
        const merged = mergeProfessionStates(local, cloud)!;
        expect(merged.plus_events).toEqual([]);
        expect(merged.start_time).toBe(1000);
    });
});
