/** visitedRooms category: import unions with local rooms. */



// ---------------------------------------------------------------------------
// visitedRooms union import
// ---------------------------------------------------------------------------

describe('importVisitedRooms union semantics', () => {
    it('unions imported rooms with locally visited rooms instead of replacing them', async () => {
        const { importVisitedRooms, exportVisitedRooms } = await import('@web/options/export/categories/visitedRooms.ts');
        const id = `UnionChar_${Date.now()}:map`;
        const character = id.split(':')[0];

        await importVisitedRooms([{ id, rooms: [1, 2, 3] }]);
        // Second import (e.g. cloud data missing locally-explored rooms 2 and 3)
        await importVisitedRooms([{ id, rooms: [3, 4] }]);

        const exported = await exportVisitedRooms([character]);
        const entry = exported.find(e => e.id === id);
        expect(entry?.rooms).toEqual([1, 2, 3, 4]);
    });
});
