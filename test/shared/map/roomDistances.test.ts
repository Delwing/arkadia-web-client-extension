import { describe, expect, test, vi } from 'vitest';
import type { Edge } from 'mudlet-map-renderer';
import { roomDistances } from '@shared/map/roomDistances.ts';
import mapData from '../../../e2e/support/mock-data/map-data.json';

function graph(edges: Array<[number, number, number?]>): Map<number, Edge[]> {
    const adj = new Map<number, Edge[]>();
    for (const [from, to, weight = 1] of edges) {
        if (!adj.has(from)) adj.set(from, []);
        if (!adj.has(to)) adj.set(to, []);
        adj.get(from)!.push({ id: to, weight });
    }
    return adj;
}

describe('roomDistances', () => {
    test('counts steps along the cheapest path, not the fewest', () => {
        // 1 -> 4 directly costs 10; 1 -> 2 -> 3 -> 4 costs 3.
        const adj = graph([[1, 4, 10], [1, 2], [2, 3], [3, 4]]);
        expect(roomDistances(adj, 1, [2, 4])).toEqual(new Map([[2, 1], [4, 3]]));
    });

    test('the start is 0; unreachable and unknown rooms are null', () => {
        const adj = graph([[1, 2], [3, 1]]);
        expect(roomDistances(adj, 1, [1, 3, 99])).toEqual(new Map([[1, 0], [3, null], [99, null]]));
        expect(roomDistances(adj, 42, [1])).toEqual(new Map([[1, null]]));
    });

    test('agrees with the pathfinder on the whole map', async () => {
        // The real renderer: the setup file mocks it for every other test.
        const { MapReader, PathFinder, MapGraph } = await vi.importActual<typeof import('mudlet-map-renderer')>('mudlet-map-renderer');
        const reader = new MapReader(mapData as any, []);
        const finder = new PathFinder(reader);
        const adj = new MapGraph(reader).getAdj();
        const ids = [...adj.keys()];
        expect(ids.length).toBeGreaterThan(10);
        const from = ids[0];
        const distances = roomDistances(adj, from, ids);
        for (const id of ids) {
            const path = finder.findPath(from, id);
            expect(distances.get(id), `room ${id}`).toBe(path ? path.length - 1 : null);
        }
    });
});
