import MapHelper from '@shared/map/MapHelper';

// The suite's renderer mock supplies MapGraph; PathFinder there returns [] from findPath, which
// stands in for the ordinary pathfinder that knows nothing about blockades.
function makeClient() {
  const events: Array<{ type: string; payload: any }> = [];
  const listeners: Record<string, Array<(p?: any) => void>> = {};
  return {
    events,
    on: (type: string, fn: (p?: any) => void) => { (listeners[type] ||= []).push(fn); },
    sendEvent: (type: string, payload?: any) => {
      events.push({ type, payload });
      (listeners[type] ?? []).forEach((fn) => fn(payload));
    },
    sendCommand: () => {},
    getSuppressMapMoveEvent: () => false,
    setSuppressMapMoveEvent: () => {},
  };
}

//   1 - 2 - 3        the short way, through 2
//    \         \
//      4 - 5 - 6     the long way, all drivable
const rooms: Record<number, any> = {
  1: { id: 1, exits: { east: 2, south: 4 }, x: 0, y: 0, z: 0, area: 1 },
  2: { id: 2, exits: { west: 1, east: 3 }, x: 1, y: 0, z: 0, area: 1 },
  3: { id: 3, exits: { west: 2, south: 6 }, x: 2, y: 0, z: 0, area: 1 },
  4: { id: 4, exits: { north: 1, east: 5 }, x: 0, y: 1, z: 0, area: 1 },
  5: { id: 5, exits: { west: 4, east: 6 }, x: 1, y: 1, z: 0, area: 1 },
  6: { id: 6, exits: { west: 5, north: 3 }, x: 2, y: 1, z: 0, area: 1 },
};

function newMap(blocked: Set<number>) {
  const client = makeClient();
  const map = new MapHelper(client as any, { carriageBlocks: () => blocked });
  (map as any).mapReader = { getRoom: (id: number) => rooms[id], getRooms: () => Object.values(rooms), getArea: () => null };
  (map as any).pathFinder = { findPath: () => [1, 2, 3] };
  map.currentRoom = rooms[1];
  return { map, client };
}

/** The room lists handed to the map for drawing, in segment order. */
function drawnSegments(client: ReturnType<typeof makeClient>) {
  const drawn = [...client.events].reverse().find((e) => e.type === 'mapPath');
  return drawn?.payload?.segments?.map((segment: any) => segment.path) ?? null;
}

describe('MapHelper leading by carriage', () => {
  test('avoids a barred room even when no leg on foot is needed', () => {
    // Regression: with the destination reachable by wagon, leadTo used to hand back to the plain
    // pathfinder, which drew the walking route straight through the room we had just marked.
    const { map, client } = newMap(new Set([2]));
    map.leadTo(3);

    const segments = drawnSegments(client);
    expect(segments).toEqual([[1, 4, 5, 6, 3]]);
    expect(segments!.flat()).not.toContain(2);
    // Nothing has to be left behind, so there is nothing to announce.
    expect(client.events.some((e) => e.type === 'carriageRoute')).toBe(false);
  });

  test('splits into two segments and explains when the destination is barred', () => {
    const { map, client } = newMap(new Set([3]));
    map.leadTo(3);

    // Driving one room to 2 and walking the last one beats driving three the long way round.
    expect(drawnSegments(client)).toEqual([[1, 2], [2, 3]]);
    const announced = client.events.find((e) => e.type === 'carriageRoute');
    expect(announced?.payload).toMatchObject({ transfer: 2, driveRooms: 1, walkRooms: 1, destinationBlocked: true });
  });

  test('redraws the route when a carriage is mounted or left', () => {
    // Boarding mid-journey changes what is passable, so a route worked out on foot is stale.
    const client = makeClient();
    const blocked = new Set([2]);
    let driving = false;
    const map = new MapHelper(client as any, { carriageBlocks: () => (driving ? blocked : null) });
    (map as any).mapReader = { getRoom: (id: number) => rooms[id], getRooms: () => Object.values(rooms), getArea: () => null };
    (map as any).pathFinder = { findPath: () => [1, 2, 3] };
    map.currentRoom = rooms[1];

    map.leadTo(3);
    expect(map.destinations).toEqual([3]);

    driving = true;
    client.sendEvent('carriageModeChanged', true);
    expect(drawnSegments(client)).toEqual([[1, 4, 5, 6, 3]]);

    driving = false;
    client.sendEvent('carriageModeChanged', false);
    expect(map.destinations).toEqual([3]);
  });

  test('marking a room redraws the route as well', () => {
    const client = makeClient();
    const blocked = new Set<number>();
    const map = new MapHelper(client as any, { carriageBlocks: () => blocked });
    (map as any).mapReader = { getRoom: (id: number) => rooms[id], getRooms: () => Object.values(rooms), getArea: () => null };
    (map as any).pathFinder = { findPath: () => [1, 2, 3] };
    map.currentRoom = rooms[1];

    map.leadTo(3);
    expect(drawnSegments(client)).toEqual([[1, 2, 3]]);

    blocked.add(2);
    client.sendEvent('carriageBlocks.changed');
    expect(drawnSegments(client)).toEqual([[1, 4, 5, 6, 3]]);
  });

  test('the route follows us along the journey instead of freezing at the start', () => {
    // Regression: the carriage route is stored as fixed segments, unlike an ordinary lead which is
    // recomputed from the current room whenever it is drawn. Driving on used to leave the original
    // segments on screen for ever.
    const { map, client } = newMap(new Set([3]));
    map.leadTo(3);
    expect(drawnSegments(client)).toEqual([[1, 2], [2, 3]]);

    // Drive the other way round; the drive leg has to be worked out afresh from here. Which
    // transfer point wins is a genuine tie from room 4, so assert the part that matters: the route
    // now starts where we are and still ends at the destination.
    map.currentRoom = rooms[4];
    client.sendEvent('enterLocation', { id: 4 });
    const moved = drawnSegments(client)!;
    expect(moved[0][0]).toBe(4);
    expect(moved[moved.length - 1].at(-1)).toBe(3);

    map.currentRoom = rooms[6];
    client.sendEvent('enterLocation', { id: 6 });
    expect(drawnSegments(client)).toEqual([[6, 3]]);
  });

  test('clears the route on arrival when the wagon got the whole way', () => {
    // Regression: with no leg on foot the route lives in the transport segments rather than in
    // _destinations, so the arrival handling that takes an ordinary lead down never fired and the
    // finished route stayed on the map.
    const { map, client } = newMap(new Set([2]));
    map.leadTo(3);
    expect(drawnSegments(client)).toEqual([[1, 4, 5, 6, 3]]);

    map.currentRoom = rooms[3];
    client.sendEvent('enterLocation', { id: 3 });

    expect(drawnSegments(client)).toBeNull();
    expect(map.destinations).toEqual([]);
  });

  test('announces where to leave the wagon once, not once per room', () => {
    const { map, client } = newMap(new Set([3]));
    map.leadTo(3);

    map.currentRoom = rooms[2];
    client.sendEvent('enterLocation', { id: 2 });
    map.currentRoom = rooms[2];
    client.sendEvent('enterLocation', { id: 2 });

    // The transfer point never changed, so it was worth saying exactly once.
    expect(client.events.filter((e) => e.type === 'carriageRoute')).toHaveLength(1);
  });

  test('leaves ordinary walking alone', () => {
    const client = makeClient();
    const map = new MapHelper(client as any, { carriageBlocks: () => null });
    (map as any).mapReader = { getRoom: (id: number) => rooms[id], getRooms: () => Object.values(rooms), getArea: () => null };
    (map as any).pathFinder = { findPath: () => [1, 2, 3] };
    map.currentRoom = rooms[1];

    map.leadTo(3);
    // Falls through to the ordinary pathfinder, which draws destinations rather than segments.
    expect(client.events.some((e) => e.type === 'carriageRoute')).toBe(false);
    expect(map.destinations).toEqual([3]);
  });
});
