import { planCarriageRoute, DRIVE_WEIGHT } from '@shared/map/carriagePathFinder';

/** Build a reader over a room list given as id -> array of exit target ids (all two-way). */
function readerOf(links: Record<number, number[]>) {
  const rooms = Object.entries(links).map(([id, exits]) => ({
    id: Number(id),
    exits: Object.fromEntries((exits as number[]).map((target, i) => [`exit${i}`, target])),
  }));
  return {
    getRooms: () => rooms,
    getRoom: (id: number) => rooms.find((room) => room.id === id),
  } as any;
}

/** A reader over rooms given whole, for the cases that need special exits. */
function readerOfRooms(rooms: any[]) {
  return { getRooms: () => rooms, getRoom: (id: number) => rooms.find((room) => room.id === id) } as any;
}

describe('planning a journey by carriage', () => {
  describe('a straight road into a building', () => {
    //  1 - 2 - 3 - 4 - 5      5 is indoors, and so is 4
    const reader = readerOf({ 1: [2], 2: [1, 3], 3: [2, 4], 4: [3, 5], 5: [4] });

    test('drives the whole way when nothing is barred', () => {
      const route = planCarriageRoute(reader, new Set(), 1, 5)!;
      expect(route.drive).toEqual([1, 2, 3, 4, 5]);
      expect(route.walk).toEqual([5]);
      expect(route.transfer).toBe(5);
      expect(route.destinationBlocked).toBe(false);
    });

    test('stops at the door and walks the rest', () => {
      const route = planCarriageRoute(reader, new Set([4, 5]), 1, 5)!;
      expect(route.drive).toEqual([1, 2, 3]);
      expect(route.walk).toEqual([3, 4, 5]);
      expect(route.transfer).toBe(3);
      expect(route.destinationBlocked).toBe(true);
    });

    test('says to dismount immediately when the wagon cannot move at all', () => {
      const route = planCarriageRoute(reader, new Set([2, 3, 4, 5]), 1, 5)!;
      expect(route.drive).toEqual([1]);
      expect(route.transfer).toBe(1);
      expect(route.walk).toEqual([1, 2, 3, 4, 5]);
    });
  });

  test('takes the drivable road even when the walking road is shorter', () => {
    //      2 - 3          short way, barred to a wagon
    //    /       \
    //  1           6      long way round is drivable
    //    \       /
    //      4 - 5
    const reader = readerOf({
      1: [2, 4], 2: [1, 3], 3: [2, 6], 4: [1, 5], 5: [4, 6], 6: [3, 5],
    });
    expect(planCarriageRoute(reader, new Set(), 1, 6)!.drive).toEqual([1, 2, 3, 6]);
    // Same length here, so barring the northern road must simply move it to the southern one.
    const detoured = planCarriageRoute(reader, new Set([2, 3]), 1, 6)!;
    expect(detoured.drive).toEqual([1, 4, 5, 6]);
    expect(detoured.walk).toEqual([6]);
  });

  test('the transfer point is found even when the two routes never meet', () => {
    // The wagon road and the footpath share only the start and the destination's neighbour, so
    // walking the foot route until it turns blocked would find the wrong place to park.
    //   foot:  1 - 10 - 11 - 12 - 9      (11, 12 barred)
    //   wagon: 1 - 20 - 21 - 9
    const reader = readerOf({
      1: [10, 20], 10: [1, 11], 11: [10, 12], 12: [11, 9],
      20: [1, 21], 21: [20, 9], 9: [12, 21],
    });
    const route = planCarriageRoute(reader, new Set([11, 12]), 1, 9)!;
    expect(route.drive).toEqual([1, 20, 21, 9]);
    expect(route.transfer).toBe(9);
  });

  test('refuses a detour that costs more driving than it saves walking', () => {
    // From 1, the destination 3 is two rooms away on foot through the barred 2. A drivable loop
    // reaches 3's neighbour but only after a long way round.
    const long: Record<number, number[]> = { 1: [2, 100], 2: [1, 3], 3: [2] };
    // 100..109 is a ten-room drivable spur that ends next to 3.
    for (let i = 100; i < 110; i++) long[i] = [i - 1 === 99 ? 1 : i - 1, i + 1];
    long[110] = [109, 3];
    long[3] = [2, 110];
    const reader = readerOf(long);

    const route = planCarriageRoute(reader, new Set([2, 3]), 1, 3)!;
    // Driving the spur costs 11 rooms * 0.5 = 5.5 plus 1 walked; staying put costs 2 walked.
    expect(DRIVE_WEIGHT).toBe(0.5);
    expect(route.transfer).toBe(1);
    expect(route.drive).toEqual([1]);
  });

  describe('exits a wagon cannot take', () => {
    /** Reader where room 1 reaches 2 only through the named special exit. */
    const readerWithSpecial = (exit: string) =>
      readerOfRooms([
        { id: 1, exits: {}, specialExits: { [exit]: 2 } },
        { id: 2, exits: {}, specialExits: { wyjscie: 1 } },
      ]);

    test('a multi-word special exit is barred, with no room marked at all', () => {
      // "wejdz na skaly" is an action, and you cannot climb while sitting on a wagon.
      const route = planCarriageRoute(readerWithSpecial('wejdz na skaly'), new Set(), 1, 2)!;
      expect(route.drive).toEqual([1]);
      expect(route.walk).toEqual([1, 2]);
      expect(route.transfer).toBe(1);
    });

    test('a single-word special exit is a place, so the wagon takes it', () => {
      const route = planCarriageRoute(readerWithSpecial('latarnia'), new Set(), 1, 2)!;
      expect(route.drive).toEqual([1, 2]);
      expect(route.walk).toEqual([2]);
    });

    test('a one-word verb exit is barred too', () => {
      const route = planCarriageRoute(readerWithSpecial('zanurkuj'), new Set(), 1, 2)!;
      expect(route.drive).toEqual([1]);
    });

    test('a plain exit to the same room keeps it drivable', () => {
      // Rooms sometimes record both; the action must not bar the ordinary way round.
      const reader = readerOfRooms([
        { id: 1, exits: { up: 2 }, specialExits: { 'wejdz na gore': 2 } },
        { id: 2, exits: { down: 1 }, specialExits: {} },
      ]);
      expect(planCarriageRoute(reader, new Set(), 1, 2)!.drive).toEqual([1, 2]);
    });
  });

  test('returns null only when the destination is unreachable on foot too', () => {
    const reader = readerOf({ 1: [2], 2: [1], 7: [8], 8: [7] });
    expect(planCarriageRoute(reader, new Set(), 1, 8)).toBeNull();
  });

  test('handles being asked to route to where we already are', () => {
    const reader = readerOf({ 1: [2], 2: [1] });
    const route = planCarriageRoute(reader, new Set(), 1, 1)!;
    expect(route.drive).toEqual([1]);
    expect(route.walk).toEqual([1]);
  });
});
