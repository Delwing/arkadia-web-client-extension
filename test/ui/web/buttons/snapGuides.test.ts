import { describe, expect, it } from 'vitest';
import { SNAP_GAP, snapBox } from '@web-ui/buttons/snapGuides.ts';

const other = { x: 100, y: 100, width: 60, height: 30 };

describe('snapBox', () => {
    it('leaves the box alone when nothing is within threshold', () => {
        expect(snapBox({ x: 300, y: 300, width: 60, height: 30 }, [other])).toEqual({ x: 300, y: 300, guides: [] });
    });

    it('snaps left edges together and draws a guide spanning both boxes', () => {
        const r = snapBox({ x: 104, y: 200, width: 40, height: 30 }, [other]);
        expect(r.x).toBe(100);
        expect(r.y).toBe(200);
        expect(r.guides).toEqual([{ axis: 'x', pos: 100, from: 100, to: 230 }]);
    });

    it('snaps centers', () => {
        const r = snapBox({ x: 112, y: 300, width: 40, height: 20 }, [other]);
        expect(r.x + 20).toBe(130);
    });

    it('prefers the closest candidate', () => {
        const r = snapBox({ x: 95, y: 300, width: 60, height: 30 }, [other, { x: 94, y: 0, width: 10, height: 10 }]);
        expect(r.x).toBe(94);
    });

    it('leaves a gap after a neighbour in the same row instead of touching it', () => {
        const r = snapBox({ x: 161, y: 97, width: 40, height: 30 }, [other]);
        expect(r.x).toBe(160 + SNAP_GAP);
        expect(r.y).toBe(100);
        expect(r.guides).toContainEqual({ axis: 'x', pos: 160 + SNAP_GAP / 2, from: 100, to: 130 });
    });

    it('leaves a gap before a neighbour', () => {
        const r = snapBox({ x: 58, y: 105, width: 40, height: 30 }, [other]);
        expect(r.x + 40).toBe(100 - SNAP_GAP);
    });

    it('leaves a gap above a neighbour in the same column', () => {
        const r = snapBox({ x: 100, y: 68, width: 60, height: 30 }, [other]);
        expect(r.y + 30).toBe(100 - SNAP_GAP);
        expect(r.guides).toContainEqual({ axis: 'y', pos: 100 - SNAP_GAP / 2, from: 100, to: 160 });
    });

    it('still lines up edge to edge with buttons that are not neighbours', () => {
        const r = snapBox({ x: 162, y: 300, width: 40, height: 30 }, [other]);
        expect(r.x).toBe(160);
    });
});
