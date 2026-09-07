import MapHelper from '@shared/map/MapHelper';

vi.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

function makeClient(): any {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  const events: { event: string; payload: any }[] = [];
  return {
    events,
    on: (event: string, fn: (...args: any[]) => void) => {
      (listeners[event] ||= []).push(fn);
    },
    fire: (event: string, ...args: any[]) => {
      (listeners[event] || []).forEach((fn) => fn(...args));
    },
    sendEvent: (event: string, payload?: any) => {
      events.push({ event, payload });
    },
    sendCommand: () => {},
    getSuppressMapMoveEvent: () => false,
    setSuppressMapMoveEvent: () => {},
  };
}

/**
 * A team follow the mapper cannot reproduce leaves the marker on the room we
 * just left. That alone is routine - the next room.info usually catches up - so
 * only a stale position GMCP cannot rescue counts as being lost.
 */
describe('MapHelper lost position', () => {
  const rooms: Record<number, any> = {
    1: { id: 1, exits: { east: 2 }, x: 0, y: 0, z: 0, area: 1 },
    2: { id: 2, exits: { west: 1 }, x: 2, y: 0, z: 0, area: 1 },
  };

  function newMap() {
    const client = makeClient();
    const map = new MapHelper(client);
    (map as any).mapReader = { getRoom: (id: number) => rooms[id], getArea: () => null };
    (map as any).mapReady = true;
    (map as any).hashes = { '0:0:0:Stirland': 1, '2:0:0:Stirland': 2 };
    map.currentRoom = rooms[1];
    // A fresh helper is waiting for its first fix; the tests that care about a
    // follow start from a mapper that believes it knows where it is.
    map.refreshPosition = false;
    return { map, client };
  }

  function lostEvents(client: any) {
    return client.events.filter((e: any) => e.event === 'mapPositionLost');
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('an unresolved follow with no usable GMCP position ends up lost', () => {
    const { map, client } = newMap();
    // GMCP is pointing at a room the map does not know, so nothing can put the
    // marker right again.
    client.fire('gmcp.room.info', { map: { x: 40, y: 40, name: 'Nieznane' } });
    client.events.length = 0;

    expect(map.followMove('Zenkiem')).toBeUndefined();
    expect(map.isLost).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(map.isLost).toBe(true);
    expect(lostEvents(client)).toEqual([
      { event: 'mapPositionLost', payload: { lost: true, reason: 'follow' } },
    ]);
  });

  test('an unresolved follow GMCP can still explain is not a loss', () => {
    const { map, client } = newMap();
    // room.info for the room we followed into arrived before the prose, so the
    // map is only a step behind and the next one will straighten it out.
    client.fire('gmcp.room.info', { map: { x: 2, y: 0, name: 'Stirland' } });
    client.events.length = 0;

    map.followMove('Zenkiem');
    vi.advanceTimersByTime(2000);

    expect(map.isLost).toBe(false);
    expect(lostEvents(client)).toEqual([]);
  });

  test('a room.info naming a known room finds us again', () => {
    const { map, client } = newMap();
    client.fire('gmcp.room.info', { map: { x: 40, y: 40, name: 'Nieznane' } });
    map.followMove('Zenkiem');
    vi.advanceTimersByTime(2000);
    expect(map.isLost).toBe(true);
    client.events.length = 0;

    client.fire('gmcp.room.info', { map: { x: 2, y: 0, name: 'Stirland' } });

    expect(map.isLost).toBe(false);
    expect(map.currentRoom.id).toBe(2);
    expect(lostEvents(client)).toEqual([
      { event: 'mapPositionLost', payload: { lost: false, reason: null } },
    ]);
  });

  test('a room the map does not know is a loss on the spot, and keeps the last good room', () => {
    const { map, client } = newMap();
    map.refreshPosition = true;

    client.fire('gmcp.room.info', { map: { x: 40, y: 40, name: 'Nieznane' } });

    expect(map.isLost).toBe(true);
    expect(map.currentRoom.id).toBe(1);
    // The refresh is still owed, so a later room.info the map does know is taken.
    expect(map.refreshPosition).toBe(true);
    expect(lostEvents(client)).toEqual([
      { event: 'mapPositionLost', payload: { lost: true, reason: 'gmcp' } },
    ]);
  });

  function getLost() {
    const { map, client } = newMap();
    map.refreshPosition = true;
    client.fire('gmcp.room.info', { map: { x: 40, y: 40, name: 'Nieznane' } });
    expect(map.isLost).toBe(true);
    return { map, client };
  }

  test('setting the position by hand clears the warning', () => {
    // /ustaw, the GPS, a plugin and the map context menu all land here.
    const { map } = getLost();

    map.setMapRoomById(2);

    expect(map.isLost).toBe(false);
  });

  test('setting the position to the room already shown clears it too', () => {
    const { map } = getLost();

    map.setMapRoomById(1);

    expect(map.isLost).toBe(false);
  });

  test('a script placing us with renderRoomById clears the warning', () => {
    // The labyrinth mappers and the tide system put us down this way.
    const { map } = getLost();

    map.renderRoomById(2);

    expect(map.isLost).toBe(false);
  });

  test('walking on from a lost position stays lost', () => {
    const { map } = getLost();

    expect(map.move('e').moved).toBe(true);
    expect(map.currentRoom.id).toBe(2);
    expect(map.isLost).toBe(true);
  });

  test('the state is served on request, for a view that mounts later', () => {
    const { client } = newMap();
    client.events.length = 0;

    client.fire('requestMapPositionLost');

    expect(lostEvents(client)).toEqual([
      { event: 'mapPositionLost', payload: { lost: false, reason: null } },
    ]);
  });
});
