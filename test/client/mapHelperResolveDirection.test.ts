import MapHelper from '@shared/map/MapHelper';

vi.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

/**
 * In the Raon labyrinth room 18's south was still unexplored (a stub), while its west exit led
 * to a room the mapper had drawn further down the same column. `s` was rewritten to `w`.
 */
describe('MapHelper resolveDirection', () => {
  const rooms: Record<number, any> = {
    1: { id: 1, area: 1, x: 0, y: 0, z: 0, exits: { west: 2 }, stubs: [] },
    2: { id: 2, area: 1, x: 0, y: 8, z: 0, exits: { east: 1 }, stubs: [] },
  };

  function mapIn(room: any) {
    const map = new MapHelper({ on: () => {}, sendEvent: () => {} } as any);
    (map as any).mapReader = { getRoom: (id: number) => rooms[id] };
    map.currentRoom = room;
    return map;
  }

  test('falls back to an exit whose target is drawn that way', () => {
    expect(mapIn(rooms[1]).resolveDirection('s')).toBe('w');
  });

  test('keeps the direction when the room has an unexplored stub that way', () => {
    expect(mapIn({ ...rooms[1], stubs: [6] }).resolveDirection('s')).toBe('s');
  });

  test('a stub elsewhere does not block the fallback', () => {
    expect(mapIn({ ...rooms[1], stubs: [1] }).resolveDirection('s')).toBe('w');
  });

  // Room 19034: a sw stub, while "zejdz na dol" lands on 19032 drawn south-west of it (y-down).
  test('a special exit drawn that way wins over a stub', () => {
    rooms[3] = { id: 3, area: 1, x: 95, y: 123, z: 0, exits: {}, specialExits: { 'zejdz na dol': 4 }, stubs: [8] };
    rooms[4] = { id: 4, area: 1, x: 93, y: 125, z: 0, exits: {}, specialExits: { 'wejdz na gore': 3 }, stubs: [] };
    expect(mapIn(rooms[3]).resolveDirection('sw')).toBe('zejdz na dol');
  });
});
