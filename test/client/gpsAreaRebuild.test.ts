import initGps from '@client/scripts/gps';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';

/**
 * GPS is rebuilt per area through MapHelper.onAreasChanged. These tests drive
 * that callback directly and then feed lines through a real trigger pipeline,
 * because what a rebuild has to guarantee is which lines still sync and which
 * stop syncing — not how the triggers underneath are shaped.
 */
function createClient(rooms: Record<number, MapData.Room[]>) {
    let live = rooms;
    let areasListener: ((areaIds: number[]) => void) | null = null;

    const client: any = {
        Triggers: new Triggers({} as any),
        Map: {
            currentRoom: {id: 999, area: 2},
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
        parse: (line: string) => client.Triggers.parseLine(new AnsiAwareBuffer(line), ''),
    };
}

const gpsRoom = (id: number, lines: string[]): MapData.Room =>
    ({id, userData: {gps: JSON.stringify([{gps_string_lines: lines, room_id: id}])}}) as any;

describe('GPS area rebuild', () => {
    it('should sync on an area that has just been built', () => {
        const {client, fireAreasChanged, parse} = createClient({2: [gpsRoom(1, ['Kuznia.'])]});
        initGps(client);

        fireAreasChanged([2]);
        parse('Kuznia.');

        expect(client.Map.setMapRoomById).toHaveBeenCalledWith(1);
    });

    it('should not sync twice when the same area is rebuilt', () => {
        const {client, fireAreasChanged, parse} = createClient({2: [gpsRoom(1, ['Kuznia.'])]});
        initGps(client);

        fireAreasChanged([2]);
        fireAreasChanged([2]);
        parse('Kuznia.');

        // Cleared each time, so the second pass re-registers rather than piling up.
        expect(client.Map.setMapRoomById).toHaveBeenCalledTimes(1);
    });

    it('should leave other areas untouched when one area changes', () => {
        const {client, fireAreasChanged, parse} = createClient({
            2: [gpsRoom(1, ['Kuznia.'])],
            3: [gpsRoom(9, ['Trakt.'])],
        });
        initGps(client);

        fireAreasChanged([2, 3]);
        fireAreasChanged([3]);
        parse('Kuznia.');

        expect(client.Map.setMapRoomById).toHaveBeenCalledWith(1);
    });

    it('should sync nothing for an area that no longer exists', () => {
        const {client, fireAreasChanged, parse} = createClient({});
        initGps(client);

        fireAreasChanged([7]);
        parse('Kuznia.');

        expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
    });

    it('should skip rooms without gps data and survive malformed json', () => {
        const broken = {id: 5, userData: {gps: '{not json'}} as any;
        const plain = {id: 6, userData: {}} as any;
        const {client, fireAreasChanged, parse} = createClient({2: [broken, plain, gpsRoom(1, ['Kuznia.'])]});
        initGps(client);

        fireAreasChanged([2]);
        parse('Kuznia.');

        expect(client.Map.setMapRoomById).toHaveBeenCalledTimes(1);
        expect(client.Map.setMapRoomById).toHaveBeenCalledWith(1);
    });
});

describe('GPS after a whole-map replacement', () => {
    it('should drop entries for areas the new map no longer has', () => {
        const {client, fireAreasChanged, setMap, parse} = createClient({
            2: [gpsRoom(1, ['Kuznia.'])],
            3: [gpsRoom(9, ['Trakt.'])],
        });
        initGps(client);
        fireAreasChanged([2, 3]);

        // replaceMap swaps to a map without area 3, and announces only what it has.
        setMap({2: [gpsRoom(1, ['Kuznia.'])]});
        fireAreasChanged([2]);
        parse('Trakt.');

        // Tags are exact, so nothing else would ever clear area 3 — leaving it
        // syncing the player to room ids that no longer exist.
        expect(client.Map.setMapRoomById).not.toHaveBeenCalled();
    });

    it('should not clear areas that are still present', () => {
        const {client, fireAreasChanged, setMap, parse} = createClient({
            2: [gpsRoom(1, ['Kuznia.'])],
            3: [gpsRoom(9, ['Trakt.'])],
        });
        initGps(client);
        fireAreasChanged([2, 3]);

        setMap({2: [gpsRoom(1, ['Kuznia.'])], 3: [gpsRoom(9, ['Trakt.'])]});
        fireAreasChanged([2]);
        parse('Trakt.');

        expect(client.Map.setMapRoomById).toHaveBeenCalledWith(9);
    });
});
