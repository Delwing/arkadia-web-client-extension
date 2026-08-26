import MapHelper from '@shared/map/MapHelper';

// applyRoomChanges rebuilds the pathfinder, so PathFinder has to be constructible.
vi.mock('mudlet-map-renderer', () => ({
    // Enough of a reader for initialize() to announce its areas.
    MapReader: function (this: any, mapData: any[]) {
        this.getAreas = () => (mapData ?? []).map((a: any) => ({
            getAreaId: () => Number(a.areaId),
            getAreaName: () => a.areaName,
        }));
        this.getRooms = () => (mapData ?? []).flatMap((a: any) => a.rooms ?? []);
        this.getRoom = () => undefined;
    },
    PathFinder: function () {
        return { rebuilt: true };
    },
}));

/** Minimal MapHelperClient — enough for the constructor and event assertions. */
function createClient() {
    const client: any = {
        on: vi.fn(),
        sendEvent: vi.fn(),
        sendCommand: vi.fn(),
        getSuppressMapMoveEvent: vi.fn(() => false),
        setSuppressMapMoveEvent: vi.fn(),
        functionalBind: {set: vi.fn()},
        shouldSetDrinkableBind: vi.fn(() => true),
    };
    return client;
}

function createArea() {
    return {
        planes: 'stale',
        exits: new Map([['stale', 1]]),
        createPlanes: vi.fn(() => 'rebuilt'),
        createExits: vi.fn(),
        markDirty: vi.fn(),
    };
}

/**
 * Builds a MapHelper with a stubbed reader. The real reader comes from a WASM-
 * backed renderer, so tests inject the two structures applyRoomChanges touches:
 * `rooms` (live objects it mutates) and `areas` (geometry it invalidates).
 */
function createHelper(rooms: Record<number, any>) {
    const client = createClient();
    const helper: any = new (MapHelper as any)(client);
    const area = createArea();

    helper.mapReader = {rooms, areas: {2: area}};
    helper.renderRoomById = vi.fn();
    helper.currentRoom = {id: 1};

    return {helper, client, area};
}

function sampleRooms() {
    return {
        1: {id: 1, area: 2, name: "Kuznia.", roomChar: "", env: 5, weight: 1, x: 0, y: 0, z: 0, exits: {north: 2}, specialExits: {}, userData: {}},
        2: {id: 2, area: 2, name: 'Trakt.', roomChar: '', env: 5, weight: 1, exits: {}, userData: {}},
    } as Record<number, any>;
}

describe('MapHelper.applyRoomChanges', () => {
    it('should mutate the live room object and report the change', () => {
        const rooms = sampleRooms();
        const {helper} = createHelper(rooms);

        const changed = helper.applyRoomChanges([{roomId: 1, name: 'Kowal, Daevon'}]);

        expect(changed).toBe(1);
        expect(rooms[1].name).toBe('Kowal, Daevon');
        expect(rooms[2].name).toBe('Trakt.');
    });

    it('should skip unknown room ids without counting them', () => {
        const {helper} = createHelper(sampleRooms());

        const changed = helper.applyRoomChanges([
            {roomId: 999, name: 'nowhere'},
            {roomId: 1, name: 'Kowal'},
        ]);

        expect(changed).toBe(1);
    });

    it('should not count a write that leaves the value unchanged', () => {
        const {helper, area} = createHelper(sampleRooms());

        const changed = helper.applyRoomChanges([{roomId: 1, name: 'Kuznia.'}]);

        expect(changed).toBe(0);
        // Nothing changed, so nothing should be invalidated either.
        expect(area.markDirty).not.toHaveBeenCalled();
    });

    it('should merge userData and delete keys passed as null', () => {
        const rooms = sampleRooms();
        rooms[1].userData = {keep: 'yes', drop: 'no'};
        const {helper} = createHelper(rooms);

        helper.applyRoomChanges([{roomId: 1, userData: {added: 'new', drop: null}}]);

        expect(rooms[1].userData).toEqual({keep: 'yes', added: 'new'});
    });

    it('should retire the previous internal_id when it changes', () => {
        const rooms = sampleRooms();
        const {helper} = createHelper(rooms);

        helper.applyRoomChanges([{roomId: 1, userData: {internal_id: 'stary'}}]);
        helper.applyRoomChanges([{roomId: 1, userData: {internal_id: 'nowy'}}]);

        // The old id must stop resolving, or leadToByInternalId walks to a room
        // that no longer advertises it.
        expect(helper.getRoomIdByInternalId('stary')).toBeNull();
        expect(helper.getRoomIdByInternalId('nowy')).toBe(1);
    });

    it('should drop the internal_id index entry when the key is removed', () => {
        const rooms = sampleRooms();
        const {helper} = createHelper(rooms);

        helper.applyRoomChanges([{roomId: 1, userData: {internal_id: 'stary'}}]);
        helper.applyRoomChanges([{roomId: 1, userData: {internal_id: null}}]);

        expect(helper.getRoomIdByInternalId('stary')).toBeNull();
    });

    it('should not steal an internal_id that belongs to another room', () => {
        const rooms = sampleRooms();
        const {helper} = createHelper(rooms);

        helper.applyRoomChanges([{roomId: 2, userData: {internal_id: 'wspolny'}}]);
        // Room 1 never owned 'wspolny', so removing its own key must leave it alone.
        rooms[1].userData.internal_id = 'wspolny';
        helper.applyRoomChanges([{roomId: 1, userData: {internal_id: null}}]);

        expect(helper.getRoomIdByInternalId('wspolny')).toBe(2);
    });

    it('should keep the internal_id index in step with userData edits', () => {
        const rooms = sampleRooms();
        const {helper} = createHelper(rooms);

        helper.applyRoomChanges([{roomId: 1, userData: {internal_id: 'kuznia_1'}}]);

        expect(helper.getRoomIdByInternalId('kuznia_1')).toBe(1);
    });

    it('should replace exits wholesale rather than merging them', () => {
        const rooms = sampleRooms();
        const {helper} = createHelper(rooms);

        helper.applyRoomChanges([{roomId: 1, exits: {south: 2}}]);

        expect(rooms[1].exits).toEqual({south: 2});
    });

    it('should replace special exits wholesale', () => {
        const rooms = sampleRooms();
        rooms[1].specialExits = {'wejdz do dziury': 2};
        const {helper} = createHelper(rooms);

        helper.applyRoomChanges([{roomId: 1, specialExits: {'wejdz do studni': 2}}]);

        expect(rooms[1].specialExits).toEqual({'wejdz do studni': 2});
    });

    it('should move a room and invalidate the area geometry', () => {
        const rooms = sampleRooms();
        const {helper, area} = createHelper(rooms);

        const changed = helper.applyRoomChanges([{roomId: 1, x: 12, y: -3, z: 1}]);

        expect(changed).toBe(1);
        expect({x: rooms[1].x, y: rooms[1].y, z: rooms[1].z}).toEqual({x: 12, y: -3, z: 1});
        expect(area.createPlanes).toHaveBeenCalled();
    });

    it('should rebuild geometry, pathfinder and view, then announce the change', () => {
        const {helper, client, area} = createHelper(sampleRooms());
        const pathFinderBefore = helper.pathFinder;

        helper.applyRoomChanges([{roomId: 1, roomChar: 'K'}]);

        expect(area.createPlanes).toHaveBeenCalled();
        expect(area.createExits).toHaveBeenCalled();
        expect(area.markDirty).toHaveBeenCalled();
        expect(helper.pathFinder).not.toBe(pathFinderBefore);
        expect(helper.renderRoomById).toHaveBeenCalledWith(1);
        expect(client.sendEvent).toHaveBeenCalledWith('mapDataChanged');
    });

    it('should honour opt-outs so a cosmetic edit can skip the expensive rebuilds', () => {
        const {helper, area} = createHelper(sampleRooms());
        const pathFinderBefore = helper.pathFinder;

        helper.applyRoomChanges(
            [{roomId: 1, name: 'Kowal'}],
            {rebuildAreas: false, rebuildPaths: false, rerender: false},
        );

        expect(area.markDirty).not.toHaveBeenCalled();
        expect(helper.pathFinder).toBe(pathFinderBefore);
        expect(helper.renderRoomById).not.toHaveBeenCalled();
    });

    it('should do nothing when there is no reader yet', () => {
        const client = createClient();
        const helper: any = new (MapHelper as any)(client);

        expect(helper.applyRoomChanges([{roomId: 1, name: 'x'}])).toBe(0);
    });
});

describe('MapHelper.syncAreas', () => {
    /** Area wrapper shaped like the renderer's: raw data under `.area`. */
    function createHelperWithArea() {
        const client = createClient();
        const helper: any = new (MapHelper as any)(client);
        const rooms: Record<number, any> = {};
        const rawArea = {
            areaId: '2',
            areaName: 'Stara nazwa',
            // Reader stores y already negated; source data is y-up.
            rooms: [{id: 1, area: 2, x: 0, y: -5, z: 0, name: 'Stary', hash: 'h-old', userData: {internal_id: 'old_1'}}],
            labels: [],
        };
        rawArea.rooms.forEach(r => { rooms[r.id] = r; });

        const wrapped = {
            area: rawArea,
            planes: 'stale',
            exits: new Map(),
            createPlanes: vi.fn(() => 'rebuilt'),
            createExits: vi.fn(),
            markDirty: vi.fn(),
        };
        helper.mapReader = {rooms, areas: {2: wrapped}};
        helper.renderRoomById = vi.fn();
        helper.currentRoom = rooms[1];
        helper.hashes = {'h-old': 1};
        helper.internalIds = {old_1: 1};

        return {helper, client, wrapped, rooms};
    }

    const incomingArea = () => ({
        areaId: 2,
        areaName: 'Nowa nazwa',
        // Source orientation (y-up), as published in mapExport.json.
        rooms: [
            {id: 1, area: 2, x: 0, y: 5, z: 0, name: 'Odnowiony', hash: 'h-new', userData: {internal_id: 'new_1'}},
            {id: 7, area: 2, x: 1, y: 5, z: 0, name: 'Nowy pokoj', hash: 'h-7', userData: {}},
        ],
        labels: [{labelId: 1, Text: 'etykieta'}],
    });

    it('should replace rooms, add new ones and rebuild the area', () => {
        const {helper, wrapped, rooms} = createHelperWithArea();

        const synced = helper.syncAreas([incomingArea()]);

        expect(synced).toBe(1);
        expect(rooms[7].name).toBe('Nowy pokoj');
        expect(rooms[1].name).toBe('Odnowiony');
        expect(wrapped.createPlanes).toHaveBeenCalled();
        expect(wrapped.createExits).toHaveBeenCalled();
        expect(wrapped.markDirty).toHaveBeenCalled();
    });

    it('should flip y the same way the reader does when loading', () => {
        const {helper, rooms} = createHelperWithArea();

        helper.syncAreas([incomingArea()]);

        // Source y:5 must land as -5 to match render orientation.
        expect(rooms[1].y).toBe(-5);
    });

    it('should carry labels and the area name across', () => {
        const {helper, wrapped} = createHelperWithArea();

        helper.syncAreas([incomingArea()]);

        expect(wrapped.area.labels).toHaveLength(1);
        expect(wrapped.area.areaName).toBe('Nowa nazwa');
        expect(helper.getAreaName(2)).toBe('Nowa nazwa');
    });

    it('should rebuild the hash and internal-id indexes, dropping stale entries', () => {
        const {helper} = createHelperWithArea();

        helper.syncAreas([incomingArea()]);

        expect(helper.hashes['h-old']).toBeUndefined();
        expect(helper.hashes['h-new']).toBe(1);
        expect(helper.getRoomIdByInternalId('old_1')).toBeNull();
        expect(helper.getRoomIdByInternalId('new_1')).toBe(1);
    });

    it('should re-resolve currentRoom so it does not point at a replaced object', () => {
        const {helper, rooms} = createHelperWithArea();

        helper.syncAreas([incomingArea()]);

        expect(helper.currentRoom).toBe(rooms[1]);
        expect(helper.currentRoom.name).toBe('Odnowiony');
    });

    it('should drop rooms that are gone from the incoming area', () => {
        const {helper, rooms} = createHelperWithArea();

        helper.syncAreas([{areaId: 2, areaName: 'Pusto', rooms: [], labels: []}]);

        expect(rooms[1]).toBeUndefined();
    });

    it('should skip unknown areas rather than inventing them', () => {
        const {helper, client} = createHelperWithArea();

        const synced = helper.syncAreas([{areaId: 99, rooms: [], labels: []}]);

        expect(synced).toBe(0);
        expect(client.sendEvent).not.toHaveBeenCalledWith('mapDataChanged');
    });
});

describe('MapHelper.replaceMap', () => {
    function createHelperForReplace() {
        const client = createClient();
        const helper: any = new (MapHelper as any)(client);
        helper.initialize = vi.fn();
        helper.colors = [{envId: 1, colors: [1, 2, 3]}];
        helper.currentRoom = {id: 42};
        return {helper, client};
    }

    const mapData = [{areaId: '1', areaName: 'A', rooms: [], labels: []}];

    it('should rebuild from the supplied map', () => {
        const {helper} = createHelperForReplace();

        expect(helper.replaceMap(mapData, 'new-colors')).toBe(true);
        // initialize() is what announces the new areas, so replaceMap must not
        // emit as well — a second notification would rebuild everything twice.
        expect(helper.initialize).toHaveBeenCalledWith(mapData, 'new-colors');
    });

    it('should keep the current palette when none is supplied', () => {
        const {helper} = createHelperForReplace();

        helper.replaceMap(mapData);

        expect(helper.initialize).toHaveBeenCalledWith(mapData, helper.colors);
    });

    it('should carry the player position over so initialize can restore it', () => {
        const {helper} = createHelperForReplace();

        helper.replaceMap(mapData);

        expect(helper.savedRoomId).toBe(42);
    });

    it('should refuse an empty payload rather than blanking the map', () => {
        const {helper} = createHelperForReplace();

        expect(helper.replaceMap([])).toBe(false);
        expect(helper.replaceMap(null)).toBe(false);
        expect(helper.initialize).not.toHaveBeenCalled();
    });
});

/**
 * `onAreasChanged` is the single entry point everything derived from map data
 * hangs off — GPS triggers, and the web view's reader reference. A rebuild that
 * forgets to announce leaves those silently pointing at the previous map, which
 * looks like "the pushed map has no edits" rather than like a missing event.
 */
describe('MapHelper.onAreasChanged', () => {
    const mapData: any = [
        {areaId: '1', areaName: 'Wyzima', rooms: [], labels: []},
        {areaId: '2', areaName: 'Rinde', rooms: [], labels: []},
    ];

    function createHelperForInit() {
        const client = createClient();
        const helper: any = new (MapHelper as any)(client);
        // initialize() renders the start room; irrelevant here and needs a real reader.
        helper.renderRoomById = vi.fn();
        return {helper, client};
    }

    it('should announce every area when the map is first built', () => {
        const {helper} = createHelperForInit();
        const seen: number[][] = [];
        helper.onAreasChanged((ids: number[]) => seen.push(ids));

        helper.initialize(mapData, []);

        expect(seen).toEqual([[1, 2]]);
    });

    it('should announce again when the map is replaced, so stale readers are noticed', () => {
        const {helper} = createHelperForInit();
        helper.initialize(mapData, []);

        const seen: number[][] = [];
        helper.onAreasChanged((ids: number[]) => seen.push(ids));
        // Subscribing replays the current areas...
        expect(seen).toEqual([[1, 2]]);

        helper.replaceMap([{areaId: '5', areaName: 'Nowe', rooms: [], labels: []}] as any);

        // ...and the rebuild announces the new set.
        expect(seen[seen.length - 1]).toEqual([5]);
    });

    it('should replay current areas to a late subscriber so there is no separate first-build path', () => {
        const {helper} = createHelperForInit();
        helper.initialize(mapData, []);

        const seen: number[][] = [];
        helper.onAreasChanged((ids: number[]) => seen.push(ids));

        expect(seen).toEqual([[1, 2]]);
    });

    it('should not announce before a map exists', () => {
        const {helper} = createHelperForInit();
        const seen: number[][] = [];

        helper.onAreasChanged((ids: number[]) => seen.push(ids));

        expect(seen).toEqual([]);
    });

    it('should stop notifying after unsubscribe', () => {
        const {helper} = createHelperForInit();
        const seen: number[][] = [];
        const off = helper.onAreasChanged((ids: number[]) => seen.push(ids));

        off();
        helper.initialize(mapData, []);

        expect(seen).toEqual([]);
    });
});
