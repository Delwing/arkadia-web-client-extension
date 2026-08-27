import MapHelper from '@shared/map/MapHelper';

vi.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

function makeClient(): any {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {};
  return {
    on: (event: string, fn: (...args: any[]) => void) => {
      (listeners[event] ||= []).push(fn);
    },
    sendEvent: () => {},
    sendCommand: () => {},
    getSuppressMapMoveEvent: () => false,
    setSuppressMapMoveEvent: () => {},
  };
}

/**
 * Riding prose does not always name a compass direction — "Wraz z ... jedziesz ... wozem traktem
 * w gore." — and the carriage trigger calls followMove() with only that token, no full follow
 * text. In a room carrying team_follow_link that used to reach an unguarded
 * `fullFollow.includes(...)` and throw, which killed the client's whole output pipeline.
 */
describe('MapHelper followMove without a fullFollow argument', () => {
  const rooms: Record<number, any> = {
    10: { id: 10, exits: { up: 11 }, x: 0, y: 0, z: 0, area: 1, userData: { team_follow_link: 'trakt*gora' } },
    11: { id: 11, exits: { down: 10 }, x: 0, y: 1, z: 0, area: 1 },
  };

  function newMap() {
    const map = new MapHelper(makeClient());
    (map as any).mapReader = { getRoom: (id: number) => rooms[id], getArea: () => null };
    map.currentRoom = rooms[10];
    return map;
  }

  test('does not throw on a non-directional follow token', () => {
    const map = newMap();
    expect(() => map.followMove('traktem w gore')).not.toThrow();
  });

  test('does not throw when no team_follow_link entry matches the token', () => {
    const map = newMap();
    // The link is keyed on a word the ride prose never contains, so the token-match branch falls
    // through to the full-follow branch — which has no full follow text to search.
    map.currentRoom = { ...rooms[10], userData: { team_follow_link: 'lodz*gora' } } as any;
    expect(() => map.followMove('traktem w gore')).not.toThrow();
  });

  test('still follows a team_follow_link matched by the token itself', () => {
    const map = newMap();
    (map as any).renderRoomById = function (id: number) { this.currentRoom = rooms[id]; };
    expect(map.followMove('traktem w gore')).toBe('gora');
  });

  test('still follows a team_follow_link matched only by the full follow text', () => {
    const map = newMap();
    (map as any).renderRoomById = function (id: number) { this.currentRoom = rooms[id]; };
    expect(map.followMove('w gore', 'podazasz traktem za woznica')).toBe('gora');
  });

  test('ignores a malformed team_follow_link entry', () => {
    const map = newMap();
    map.currentRoom = { ...rooms[10], userData: { team_follow_link: 'brak-gwiazdki' } } as any;
    expect(() => map.followMove('traktem w gore', 'cokolwiek')).not.toThrow();
  });
});
