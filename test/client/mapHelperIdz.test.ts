import MapHelper from '@shared/map/MapHelper';

vi.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

function makeClient(): any {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  return {
    on: (event: string, fn: (...args: any[]) => void) => {
      (listeners[event] ||= []).push(fn);
    },
    fire: (event: string, ...args: any[]) => {
      (listeners[event] || []).forEach((fn) => fn(...args));
    },
    sendEvent: () => {},
    sendCommand: () => {},
    getSuppressMapMoveEvent: () => false,
    setSuppressMapMoveEvent: () => {},
  };
}

describe('MapHelper parseCommand', () => {
  test('idz chooses alternate exit', () => {
    const map = new MapHelper(makeClient());
    map.currentRoom = { exits: { north: 1, south: 3 } } as any;
    map.locationHistory.push(1, 2);
    const res = map.parseCommand('idz');
    expect(res).toBe('s');
  });
});

describe('MapHelper followMove during idz marszem', () => {
  // Mirrors data/arkadia-recording-chodzenie.json: rooms along an east trakt,
  // each one map x-unit +2 from the last.
  //   6777 (x69) --east--> 6776 (x71) --east--> 6775 (x73)
  const rooms: Record<number, any> = {
    6777: { id: 6777, exits: { east: 6776 }, x: 69, y: 11, z: 0, area: 1 },
    6776: { id: 6776, exits: { east: 6775, west: 6777 }, x: 71, y: 11, z: 0, area: 1 },
    6775: { id: 6775, exits: { west: 6776 }, x: 73, y: 11, z: 0, area: 1 },
  };

  function newMap() {
    const client = makeClient();
    const map = new MapHelper(client);
    (map as any).mapReader = {
      getRoom: (id: number) => rooms[id],
      getArea: () => null,
    };
    (map as any).hashes = {
      '69:11:0:Stirland': 6777,
      '71:11:0:Stirland': 6776,
      '73:11:0:Stirland': 6775,
    };
    return { map, client };
  }

  function roomInfo(x: number) {
    return { map: { x, y: 11, name: 'Stirland' } };
  }

  test('GMCP-before-prose step: room.info advances, follow step must not double it', () => {
    const { map, client } = newMap();
    map.currentRoom = rooms[6777];
    map.refreshPosition = true; // previous step left GMCP authoritative

    // room.info for the new room is parsed inline first and advances us...
    client.fire('gmcp.room.info', roomInfo(71));
    expect(map.currentRoom.id).toBe(6776);

    // ...then the buffered "Ruszasz marszem na wschod." prose arrives. It must
    // not walk us a second room east (the bug: ending at 6775).
    const result = map.followMove('wschod');
    expect(result).toBeUndefined();
    expect(map.currentRoom.id).toBe(6776);
  });

  test('prose-before-GMCP step: follow step still moves when room.info has not arrived', () => {
    const { map, client } = newMap();
    map.currentRoom = rooms[6777];
    map.refreshPosition = false;
    // Stale GMCP position from the previous step still equals the current room.
    client.fire('gmcp.room.info', roomInfo(69));
    expect(map.currentRoom.id).toBe(6777);

    // Prose arrives before this step's room.info — the relative move is required.
    const result = map.followMove('wschod');
    expect(result).toBe('wschod');
    expect(map.currentRoom.id).toBe(6776);
  });
});
