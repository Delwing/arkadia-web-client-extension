import MapHelper from '@shared/map/MapHelper';

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

//  1 - 2 - 3 ~~ ferry ~~ 7 - 8      nothing walks between the two shores
const rooms: Record<number, any> = {
  1: { id: 1, exits: { east: 2 }, x: 0, y: 0, z: 0, area: 1 },
  2: { id: 2, exits: { west: 1, east: 3 }, x: 1, y: 0, z: 0, area: 1 },
  3: { id: 3, exits: { west: 2 }, x: 2, y: 0, z: 0, area: 1 },
  7: { id: 7, exits: { east: 8 }, x: 9, y: 0, z: 0, area: 2 },
  8: { id: 8, exits: { west: 7 }, x: 10, y: 0, z: 0, area: 2 },
};

const ferry = [{
  name: 'Prom',
  boardCommands: ['wsiadz na prom'],
  exitCommand: 'wysiadz',
  stops: [
    { start: 3, destination: 7, time: 60, label: 'drugi brzeg' },
    { start: 7, destination: 3, time: 60, label: 'pierwszy brzeg' },
  ],
}];

function newMap(options: { blocked?: Set<number> | null; walkingPath?: number[] | null } = {}) {
  const client = makeClient();
  const map = new MapHelper(client as any, {
    carriageBlocks: () => options.blocked ?? null,
    transportDefs: () => ferry as any,
  });
  (map as any).mapReader = {
    getRoom: (id: number) => rooms[id],
    getRooms: () => Object.values(rooms),
    getArea: () => null,
  };
  (map as any).pathFinder = { findPath: () => options.walkingPath ?? null };
  map.currentRoom = rooms[1];
  return { map, client };
}

const lastEvent = (client: ReturnType<typeof makeClient>, type: string) =>
  [...client.events].reverse().find((e) => e.type === type);

/** The room lists handed to the map for drawing, in segment order. */
const drawnSegments = (client: ReturnType<typeof makeClient>) =>
  lastEvent(client, 'mapPath')?.payload?.segments?.map((segment: any) => segment.path) ?? null;

describe('MapHelper leading with transports', () => {
  test('falls back to a ferry when there is no way there on foot', () => {
    const { map, client } = newMap();

    map.leadTo(8);

    expect(drawnSegments(client)).toEqual([[1, 2, 3], [7, 8]]);
    const planned = lastEvent(client, 'routePlanned')!;
    expect(planned.payload.viaFallback).toBe(true);
    expect(planned.payload.segments.filter((s: any) => s.kind === 'transport')).toMatchObject([
      { transportName: 'Prom', fromRoomId: 3, toRoomId: 7 },
    ]);
    // The fallback found a route, so nothing should claim there is none.
    expect(client.events.some((e) => e.type === 'notify')).toBe(false);
  });

  test('says so when nothing reaches the destination at all', () => {
    const { map, client } = newMap();

    map.leadTo(4711);

    expect(lastEvent(client, 'notify')?.payload).toEqual({ text: 'Brak sciezki do lokacji' });
    expect(client.events.some((e) => e.type === 'routePlanned')).toBe(false);
  });

  test('leaves an ordinary walk to the plain pathfinder', () => {
    const { map, client } = newMap({ walkingPath: [1, 2, 3] });

    map.leadTo(3);

    expect(map.destinations).toEqual([3]);
    expect(client.events.some((e) => e.type === 'routePlanned')).toBe(false);
  });

  test('asked for a transport route, plans one even where walking would do', () => {
    const { map, client } = newMap({ walkingPath: [1, 2, 3] });

    map.leadTo(8, { transport: true });

    expect(drawnSegments(client)).toEqual([[1, 2, 3], [7, 8]]);
    expect(lastEvent(client, 'routePlanned')?.payload?.viaFallback).toBe(false);
  });

  test('the wagon comes aboard and is left on the far shore', () => {
    // A wagon can be taken on a ship, so it is only left where it genuinely cannot follow - here
    // the destination itself, one room past the far quay.
    const { map, client } = newMap({ blocked: new Set([8]) });

    map.leadTo(8, { transport: true });

    const planned = lastEvent(client, 'routePlanned')!.payload.segments;
    expect(planned.map((s: any) => s.kind)).toEqual(['drive', 'transport', 'walk']);
    expect(planned[0].rooms).toEqual([1, 2, 3]);
    expect(planned[1].withWagon).toBe(true);
    expect(lastEvent(client, 'carriageRouteStep')?.payload).toEqual({ nextCommand: 'e', atTransfer: false });
    expect(lastEvent(client, 'carriageRoute')?.payload).toMatchObject({
      transfer: 7,
      driveRooms: 2,
      walkRooms: 1,
      destinationBlocked: true,
      // Nothing left to board once the wagon is behind us.
      boarding: null,
    });
  });

  test('a quay barred to wagons means boarding on foot', () => {
    // With the wagon unable to reach the ship at all, it is left short of the quay and the crossing
    // is made without it - which the announcement has to say, or it reads as a stroll.
    const { map, client } = newMap({ blocked: new Set([3, 8]) });

    map.leadTo(8, { transport: true });

    const planned = lastEvent(client, 'routePlanned')!.payload.segments;
    expect(planned.map((s: any) => s.kind)).toEqual(['drive', 'walk', 'transport', 'walk']);
    expect(planned[2].withWagon).toBe(false);
    expect(lastEvent(client, 'carriageRoute')?.payload).toMatchObject({
      transfer: 2,
      driveRooms: 1,
      walkRooms: 2,
      boarding: 'Prom',
    });
  });

  test('the drawn route follows us along it on foot', () => {
    // Regression: a planned route is stored as fixed segments, unlike an ordinary lead which is
    // recomputed from the current room whenever it is drawn, so it used to stay frozen at the room
    // the journey began in.
    const { map, client } = newMap();
    map.leadTo(8, { transport: true });
    expect(drawnSegments(client)).toEqual([[1, 2, 3], [7, 8]]);

    map.currentRoom = rooms[2];
    client.sendEvent('enterLocation', { room: rooms[2] });

    expect(drawnSegments(client)).toEqual([[2, 3], [7, 8]]);
  });

  test('the route comes down once we are there', () => {
    const { map, client } = newMap();
    map.leadTo(8, { transport: true });

    map.currentRoom = rooms[8];
    client.sendEvent('enterLocation', { room: rooms[8] });

    expect(lastEvent(client, 'mapPath')?.payload).toBeNull();
    expect(map.destinations).toEqual([]);
  });

  test('leaves the route alone while we are aboard', () => {
    // The rooms a ship passes through are its route, not ours; replanning from one would throw
    // away the ride we are in the middle of.
    const { map, client } = newMap();
    map.leadTo(8, { transport: true });
    client.sendEvent('transport.onBoard', true);

    map.currentRoom = rooms[3];
    client.sendEvent('enterLocation', { room: rooms[3] });

    expect(drawnSegments(client)).toEqual([[1, 2, 3], [7, 8]]);
  });

  test('redrawing a transport route on the move does not repeat the instructions', () => {
    const { map, client } = newMap({ blocked: new Set([8]) });
    map.leadTo(8, { transport: true });
    const announcements = client.events.filter((e) => e.type === 'routePlanned').length;

    map.currentRoom = rooms[2];
    client.sendEvent('enterLocation', { room: rooms[2] });

    expect(drawnSegments(client)).toEqual([[2, 3], [7, 8]]);
    expect(client.events.filter((e) => e.type === 'routePlanned')).toHaveLength(announcements);
  });
});
