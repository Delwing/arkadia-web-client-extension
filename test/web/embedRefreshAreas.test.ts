import { EmbeddedMap } from '@web/embed';

/**
 * `refreshAreas` is what makes a live map edit visible: the renderer caches
 * per-area geometry, so changed data stays off screen until the area is drawn
 * again. These tests pin down that it redraws exactly when the changed area is
 * the one on screen — and stays quiet otherwise, since a redraw of the full map
 * area is not free.
 */
function createEmbedded(opts: { viewingPlayer: boolean; playerArea?: number; viewedArea?: number | null; viewedZ?: number | null }) {
    const embedded: any = Object.create(EmbeddedMap.prototype);

    embedded.currentRoom = 1;
    embedded.reader = {
        getRoom: (id: number) => (id === 1 ? {id: 1, area: opts.playerArea ?? 2, z: 0} : undefined),
        getArea: () => undefined,
    };
    embedded._isViewingPlayerPosition = opts.viewingPlayer;
    embedded._viewedAreaId = opts.viewedArea ?? null;
    embedded._viewedZ = opts.viewedZ ?? null;

    embedded.refreshLabels = vi.fn();
    embedded.viewAreaLevel = vi.fn();

    return embedded;
}

describe('EmbeddedMap.refreshAreas', () => {
    it('should redraw the player area when it is the one that changed', () => {
        const embedded = createEmbedded({viewingPlayer: true, playerArea: 2});

        embedded.refreshAreas([2]);

        expect(embedded.refreshLabels).toHaveBeenCalled();
    });

    it('should stay quiet when a different area changed', () => {
        const embedded = createEmbedded({viewingPlayer: true, playerArea: 2});

        embedded.refreshAreas([7, 9]);

        expect(embedded.refreshLabels).not.toHaveBeenCalled();
        expect(embedded.viewAreaLevel).not.toHaveBeenCalled();
    });

    it('should redraw the browsed area when looking away from the player', () => {
        const embedded = createEmbedded({viewingPlayer: false, playerArea: 2, viewedArea: 7, viewedZ: -1});

        embedded.refreshAreas([7]);

        expect(embedded.viewAreaLevel).toHaveBeenCalledWith(7, -1);
        // The player's area is not on screen, so it must not steal the view back.
        expect(embedded.refreshLabels).not.toHaveBeenCalled();
    });

    it('should not redraw the browsed area when only the player area changed', () => {
        const embedded = createEmbedded({viewingPlayer: false, playerArea: 2, viewedArea: 7, viewedZ: 0});

        embedded.refreshAreas([2]);

        expect(embedded.viewAreaLevel).not.toHaveBeenCalled();
    });

    it('should do nothing when nothing is on screen yet', () => {
        const embedded = createEmbedded({viewingPlayer: false, viewedArea: null});

        embedded.refreshAreas([1, 2, 3]);

        expect(embedded.viewAreaLevel).not.toHaveBeenCalled();
        expect(embedded.refreshLabels).not.toHaveBeenCalled();
    });
});
