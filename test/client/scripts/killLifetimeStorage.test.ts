import {
    recordKillToDB,
    getLifetimeTotals,
    getKillsByDate,
    getGlobalKillStats,
    getKillsGroupedByDate,
    getAllRecords,
    getDistinctDates,
    migrateFromLocalStorage,
    importRecords,
    importAllKillRecords,
    makeId,
} from '@client/scripts/killLifetimeStorage';

// Use unique character names per test to avoid cross-test interference
// since deleteDatabase can block on open connections
let testIndex = 0;
function uniqueChar(): string {
    return `TestChar_${testIndex++}_${Date.now()}`;
}

beforeEach(() => {
    localStorage.clear();
});

describe('killLifetimeStorage', () => {
    test('recordKillToDB inserts new record', async () => {
        const CHARACTER = uniqueChar();
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        const records = await getAllRecords(CHARACTER);
        expect(records).toHaveLength(1);
        expect(records[0]).toEqual({
            id: makeId(CHARACTER, 'goblin', '2025/1/15'),
            character: CHARACTER,
            mob: 'goblin',
            date: '2025/1/15',
            count: 1,
        });
    });

    test('recordKillToDB increments existing record', async () => {
        const CHARACTER = uniqueChar();
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        const records = await getAllRecords(CHARACTER);
        expect(records).toHaveLength(1);
        expect(records[0].count).toBe(3);
    });

    test('getLifetimeTotals aggregates across dates', async () => {
        const CHARACTER = uniqueChar();
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/16');
        await recordKillToDB(CHARACTER, 'troll', '2025/1/15');
        const totals = await getLifetimeTotals(CHARACTER);
        expect(totals).toEqual([
            {mob: 'goblin', total: 2},
            {mob: 'troll', total: 1},
        ]);
    });

    test('getKillsByDate returns only kills for that date', async () => {
        const CHARACTER = uniqueChar();
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/16');
        await recordKillToDB(CHARACTER, 'troll', '2025/1/15');

        const day15 = await getKillsByDate(CHARACTER, '2025/1/15');
        expect(day15).toEqual([
            {mob: 'goblin', count: 1},
            {mob: 'troll', count: 1},
        ]);

        const day16 = await getKillsByDate(CHARACTER, '2025/1/16');
        expect(day16).toEqual([{mob: 'goblin', count: 1}]);

        const day17 = await getKillsByDate(CHARACTER, '2025/1/17');
        expect(day17).toEqual([]);
    });

    test('getGlobalKillStats computes kills per day', async () => {
        const CHARACTER = uniqueChar();
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/16');

        const stats = await getGlobalKillStats(CHARACTER);
        expect(stats).toHaveLength(1);
        expect(stats[0].mob).toBe('goblin');
        expect(stats[0].total).toBe(3);
        expect(stats[0].daysActive).toBe(2);
        expect(stats[0].killsPerDay).toBe(1.5);
    });

    test('getDistinctDates returns unique dates', async () => {
        const CHARACTER = uniqueChar();
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        await recordKillToDB(CHARACTER, 'troll', '2025/1/15');
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/16');

        const dates = await getDistinctDates(CHARACTER);
        expect(dates.sort()).toEqual(['2025/1/15', '2025/1/16']);
    });

    test('character scoping isolates data', async () => {
        const charA = uniqueChar();
        const charB = uniqueChar();
        await recordKillToDB(charA, 'goblin', '2025/1/15');
        await recordKillToDB(charB, 'troll', '2025/1/15');

        const totalsA = await getLifetimeTotals(charA);
        expect(totalsA).toEqual([{mob: 'goblin', total: 1}]);

        const totalsB = await getLifetimeTotals(charB);
        expect(totalsB).toEqual([{mob: 'troll', total: 1}]);
    });

    test('migrateFromLocalStorage converts data with unknown date', async () => {
        const CHARACTER = uniqueChar();
        localStorage.setItem(`${CHARACTER}:kill_counter`, JSON.stringify({
            goblin: 5,
            troll: 3,
        }));

        await migrateFromLocalStorage(CHARACTER);

        const records = await getAllRecords(CHARACTER);
        expect(records).toHaveLength(2);

        const goblin = records.find(r => r.mob === 'goblin');
        expect(goblin).toEqual({
            id: makeId(CHARACTER, 'goblin', 'unknown'),
            character: CHARACTER,
            mob: 'goblin',
            date: 'unknown',
            count: 5,
        });

        const troll = records.find(r => r.mob === 'troll');
        expect(troll).toEqual({
            id: makeId(CHARACTER, 'troll', 'unknown'),
            character: CHARACTER,
            mob: 'troll',
            date: 'unknown',
            count: 3,
        });
    });

    test('migrateFromLocalStorage is idempotent', async () => {
        const CHARACTER = uniqueChar();
        localStorage.setItem(`${CHARACTER}:kill_counter`, JSON.stringify({goblin: 5}));

        await migrateFromLocalStorage(CHARACTER);
        await migrateFromLocalStorage(CHARACTER);

        const records = await getAllRecords(CHARACTER);
        expect(records).toHaveLength(1);
        expect(records[0].count).toBe(5);
    });

    test('migrateFromLocalStorage handles empty data', async () => {
        const CHARACTER = uniqueChar();
        await migrateFromLocalStorage(CHARACTER);
        const records = await getAllRecords(CHARACTER);
        expect(records).toHaveLength(0);
        expect(localStorage.getItem(`kill_idb_migrated:${CHARACTER}`)).toBe('true');
    });

    test('importRecords bulk inserts records', async () => {
        const CHARACTER = uniqueChar();
        await importRecords([
            {id: makeId(CHARACTER, 'goblin', '2025/1/1'), character: CHARACTER, mob: 'goblin', date: '2025/1/1', count: 10},
            {id: makeId(CHARACTER, 'troll', '2025/1/1'), character: CHARACTER, mob: 'troll', date: '2025/1/1', count: 5},
        ]);

        const records = await getAllRecords(CHARACTER);
        expect(records).toHaveLength(2);
    });

    test('getKillsGroupedByDate returns groups sorted chronologically', async () => {
        const CHARACTER = uniqueChar();
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/16');
        await recordKillToDB(CHARACTER, 'troll', '2025/1/15');
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');

        const groups = await getKillsGroupedByDate(CHARACTER);
        expect(groups).toHaveLength(2);

        expect(groups[0].date).toBe('2025/1/15');
        expect(groups[0].kills).toEqual([
            {mob: 'goblin', count: 1},
            {mob: 'troll', count: 1},
        ]);
        expect(groups[0].total).toBe(2);

        expect(groups[1].date).toBe('2025/1/16');
        expect(groups[1].kills).toEqual([{mob: 'goblin', count: 1}]);
        expect(groups[1].total).toBe(1);
    });

    test('getKillsGroupedByDate puts unknown date first', async () => {
        const CHARACTER = uniqueChar();
        await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
        await recordKillToDB(CHARACTER, 'troll', 'unknown');

        const groups = await getKillsGroupedByDate(CHARACTER);
        expect(groups).toHaveLength(2);
        expect(groups[0].date).toBe('unknown');
        expect(groups[1].date).toBe('2025/1/15');
    });

    describe('importAllKillRecords merge semantics', () => {
        test('keeps the higher local count when importing a lower one for the same record', async () => {
            const CHARACTER = uniqueChar();
            for (let i = 0; i < 5; i++) {
                await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');
            }

            await importAllKillRecords([{
                id: makeId(CHARACTER, 'goblin', '2025/1/15'),
                character: CHARACTER,
                mob: 'goblin',
                date: '2025/1/15',
                count: 3,
            }]);

            const records = await getAllRecords(CHARACTER);
            expect(records).toHaveLength(1);
            expect(records[0].count).toBe(5);
        });

        test('takes the imported count when it is higher', async () => {
            const CHARACTER = uniqueChar();
            await recordKillToDB(CHARACTER, 'goblin', '2025/1/15');

            await importAllKillRecords([{
                id: makeId(CHARACTER, 'goblin', '2025/1/15'),
                character: CHARACTER,
                mob: 'goblin',
                date: '2025/1/15',
                count: 9,
            }]);

            const records = await getAllRecords(CHARACTER);
            expect(records).toHaveLength(1);
            expect(records[0].count).toBe(9);
        });

        test('adds records that do not exist locally', async () => {
            const CHARACTER = uniqueChar();
            await importAllKillRecords([{
                id: makeId(CHARACTER, 'troll', '2025/1/16'),
                character: CHARACTER,
                mob: 'troll',
                date: '2025/1/16',
                count: 2,
            }]);

            const records = await getAllRecords(CHARACTER);
            expect(records).toHaveLength(1);
            expect(records[0].count).toBe(2);
        });
    });
});
