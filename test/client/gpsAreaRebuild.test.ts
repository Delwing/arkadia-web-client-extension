import initGps from '@client/scripts/gps';

/**
 * GPS is rebuilt per area through MapHelper.onAreasChanged. These tests drive
 * that callback directly to check the tagging and teardown, which is what makes
 * a rebuild safe to run repeatedly.
 */
function createClient(rooms: Record<number, MapData.Room[]>) {
    let live = rooms;
    let areasListener: ((areaIds: number[]) => void) | null = null;

    const client: any = {
        Triggers: {
            registerTrigger: vi.fn(() => ({registerChild: vi.fn()})),
            removeByTag: vi.fn(),
        },
        Map: {
            currentRoom: {id: 1, area: 2},
            getAreaName: vi.fn(() => 'Rinde'),
            setMapRoomById: vi.fn(),
            tryGetMapReader: () => ({
                getArea: (areaId: number) =>
                    live[areaId] ? {getRooms: () => live[areaId]} : undefined,
            }),
            onAreasChanged: (cb: (areaIds: number[]) => void) => {
                areasListener = cb;
                return () => { areasListener = null; };
            },
        },
        sendEvent: vi.fn(),
    };

    return {
        client,
        fireAreasChanged: (ids: number[]) => areasListener?.(ids),
        /** Swap the whole map, as replaceMap does. */
        setMap: (next: Record<number, MapData.Room[]>) => { live = next; },
    };
}

const gpsRoom = (id: number, lines: string[]): MapData.Room =>
    ({id, userData: {gps: JSON.stringify([{gps_string_lines: lines, room_id: id}])}}) as any;

describe('GPS area rebuild', () => {
    it('should register triggers under a per-area tag', () => {
        const {client, fireAreasChanged} = createClient({2: [gpsRoom(1, ['Kuznia.'])]});
        initGps(client);

        fireAreasChanged([2]);

        expect(client.Triggers.registerTrigger).toHaveBeenCalledWith(
            'Kuznia.', expect.any(Function), 'gps:2', expect.anything(),
        );
    });

    it('should clear the area tag before rebuilding so entries cannot pile up', () => {
        const {client, fireAreasChanged} = createClient({2: [gpsRoom(1, ['Kuznia.'])]});
        initGps(client);

        fireAreasChanged([2]);
        fireAreasChanged([2]);

        expect(client.Triggers.removeByTag).toHaveBeenCalledWith('gps:2');
        expect(client.Triggers.removeByTag).toHaveBeenCalledTimes(2);
        // Cleared each time, so the second pass re-registers rather than duplicating.
        expect(client.Triggers.registerTrigger).toHaveBeenCalledTimes(2);
    });

    it('should leave other areas untouched when one area changes', () => {
        const {client, fireAreasChanged} = createClient({
            2: [gpsRoom(1, ['Kuznia.'])],
            3: [gpsRoom(9, ['Trakt.'])],
        });
        initGps(client);

        fireAreasChanged([3]);

        expect(client.Triggers.removeByTag).toHaveBeenCalledWith('gps:3');
        expect(client.Triggers.removeByTag).not.toHaveBeenCalledWith('gps:2');
    });

    it('should still clear an area that no longer exists', () => {
        const {client, fireAreasChanged} = createClient({});
        initGps(client);

        fireAreasChanged([7]);

        expect(client.Triggers.removeByTag).toHaveBeenCalledWith('gps:7');
        expect(client.Triggers.registerTrigger).not.toHaveBeenCalled();
    });

    it('should skip rooms without gps data and survive malformed json', () => {
        const broken = {id: 5, userData: {gps: '{not json'}} as any;
        const plain = {id: 6, userData: {}} as any;
        const {client, fireAreasChanged} = createClient({2: [broken, plain, gpsRoom(1, ['Kuznia.'])]});
        initGps(client);

        fireAreasChanged([2]);

        expect(client.Triggers.registerTrigger).toHaveBeenCalledTimes(1);
    });
});

describe('GPS after a whole-map replacement', () => {
    it('should drop triggers for areas the new map no longer has', () => {
        const {client, fireAreasChanged, setMap} = createClient({
            2: [gpsRoom(1, ['Kuznia.'])],
            3: [gpsRoom(9, ['Trakt.'])],
        });
        initGps(client);
        fireAreasChanged([2, 3]);
        client.Triggers.removeByTag.mockClear();

        // replaceMap swaps to a map without area 3, and announces only what it has.
        setMap({2: [gpsRoom(1, ['Kuznia.'])]});
        fireAreasChanged([2]);

        // Tags are exact, so nothing else would ever clear area 3 — leaving it
        // syncing the player to room ids that no longer exist.
        expect(client.Triggers.removeByTag).toHaveBeenCalledWith('gps:3');
    });

    it('should not clear areas that are still present', () => {
        const {client, fireAreasChanged, setMap} = createClient({
            2: [gpsRoom(1, ['Kuznia.'])],
            3: [gpsRoom(9, ['Trakt.'])],
        });
        initGps(client);
        fireAreasChanged([2, 3]);
        client.Triggers.removeByTag.mockClear();

        setMap({2: [gpsRoom(1, ['Kuznia.'])], 3: [gpsRoom(9, ['Trakt.'])]});
        fireAreasChanged([2]);

        expect(client.Triggers.removeByTag).not.toHaveBeenCalledWith('gps:3');
    });
});
