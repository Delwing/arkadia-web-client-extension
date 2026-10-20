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
 * A room handed over from another device can arrive after the player has already
 * taken a few steps here - steps the map took from the room this device last
 * saw. The journal keeps the steps as taken, so they can be walked again from the
 * room that arrived.
 */
describe('MapHelper journal', () => {
  const rooms: Record<number, any> = {
    // Where we really are: a road running east.
    1: { id: 1, exits: { east: 2, north: 12 }, x: 0, y: 0, z: 0, area: 1 },
    12: { id: 12, exits: { south: 1 }, x: 0, y: 2, z: 0, area: 1 },
    2: { id: 2, exits: { west: 1, east: 3 }, x: 2, y: 0, z: 0, area: 1 },
    3: { id: 3, exits: { west: 2 }, x: 4, y: 0, z: 0, area: 1 },
    // Where this device last saw us: nothing leads east from here.
    10: { id: 10, exits: { north: 11 }, x: 0, y: 10, z: 0, area: 1 },
    11: { id: 11, exits: { south: 10 }, x: 0, y: 12, z: 0, area: 1 },
  };

  function newMap() {
    const client = makeClient();
    const map = new MapHelper(client);
    (map as any).mapReader = { getRoom: (id: number) => rooms[id], getArea: () => null };
    (map as any).mapReady = true;
    map.currentRoom = rooms[10];
    map.locationHistory.push(10);
    map.refreshPosition = false;
    map.startJournal();
    return { map, client };
  }

  function lostReason(client: any) {
    return client.events.filter((e: any) => e.event === 'mapPositionLost').at(-1)?.payload.reason ?? null;
  }

  test('walks the steps again from the room handed over', () => {
    const { map, client } = newMap();
    // A step the stale room has no exit for, and a follow it cannot resolve either.
    map.move('e');
    map.followMove('wschod', 'za Zenkiem na wschod');
    expect(map.currentRoom.id).toBe(10);

    expect(map.replayJournal(1, false)).toBe(true);

    expect(map.currentRoom.id).toBe(3);
    expect(map.isLost).toBe(false);
    expect(lostReason(client)).not.toBe('handoff');
  });

  test('keeps a step the map took and undid', () => {
    const { map } = newMap();
    map.move('n');
    map.moveBack();
    map.move('e');

    map.replayJournal(1, false);

    expect(map.currentRoom.id).toBe(2);
  });

  test('leaves out commands that are not steps', () => {
    const { map } = newMap();
    map.move('kup piwo');
    map.move('e');

    map.replayJournal(1, false);

    expect(map.currentRoom.id).toBe(2);
    expect(map.isLost).toBe(false);
  });

  test('stays put on a step the room has no exit for, as the game would', () => {
    const { map } = newMap();
    map.move('w');

    map.replayJournal(1, false);

    expect(map.currentRoom.id).toBe(1);
    expect(map.isLost).toBe(false);
  });

  test('is lost when a follow leads nowhere from the room handed over', () => {
    const { map, client } = newMap();
    map.followMove('zachod', 'za Zenkiem na zachod');

    map.replayJournal(1, false);

    expect(map.currentRoom.id).toBe(1);
    expect(map.isLost).toBe(true);
    expect(lostReason(client)).toBe('handoff');
  });

  test('marks an unconfirmed room as lost', () => {
    const { map, client } = newMap();
    map.move('e');

    map.replayJournal(1, true);

    expect(map.currentRoom.id).toBe(2);
    expect(lostReason(client)).toBe('handoff');
  });

  test('gives way to a placement made since it started', () => {
    const { map } = newMap();
    map.move('e');
    map.setMapRoomById(11);

    expect(map.placedSinceJournal).toBe(true);
    expect(map.replayJournal(1, false)).toBe(false);
    expect(map.currentRoom.id).toBe(11);
  });

  test('can walk the same steps again from a better room', () => {
    const { map } = newMap();
    map.move('e');
    map.replayJournal(2, true);
    expect(map.currentRoom.id).toBe(3);
    // The room the session really ended in arrives after the guess.
    expect(map.placedSinceJournal).toBe(false);

    map.replayJournal(1, false);

    expect(map.currentRoom.id).toBe(2);
    expect(map.isLost).toBe(false);
  });

  test('does nothing once stopped', () => {
    const { map } = newMap();
    map.stopJournal();

    expect(map.replayJournal(1, false)).toBe(false);
    expect(map.currentRoom.id).toBe(10);
  });
});
