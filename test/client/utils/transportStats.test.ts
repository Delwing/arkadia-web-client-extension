import {
  clearTransportStats,
  deleteTransportSegment,
  getAllTransportSegments,
  getAllTransportSegmentValues,
  recordTransportSegment,
} from '@client/utils/transportStats';

describe('transport stats storage', () => {
  beforeEach(async () => {
    await clearTransportStats();
  });

  test('persists segment entries in indexeddb', async () => {
    const startedAt = Date.now();
    await recordTransportSegment({
      transport: 'Test Route',
      fromId: 1,
      toId: 2,
      fromLabel: 'Start',
      toLabel: 'End',
      startedAt,
      endedAt: startedAt + 1000,
      duration: 1,
      expectedDuration: null,
    });

    const segments = await getAllTransportSegments();
    expect(segments.length).toBeGreaterThanOrEqual(1);
    const latest = segments.find(segment => segment.transport === 'Test Route');
    expect(latest).toBeTruthy();
    const record = latest!;
    expect(record.transport).toBe('Test Route');
    expect(record.shortestDuration.duration).toBe(1);
    expect(record.longestDuration.duration).toBe(1);
    expect(record.expectedDuration).toBeNull();
  });

  test('stores only shortest and longest duration per segment', async () => {
    const startedAt = Date.now();
    await recordTransportSegment({
      transport: 'Test Route',
      fromId: 1,
      toId: 2,
      fromLabel: 'Start',
      toLabel: 'End',
      startedAt,
      endedAt: startedAt + 1000,
      duration: 1,
      expectedDuration: null,
    });

    await recordTransportSegment({
      transport: 'Test Route',
      fromId: 1,
      toId: 2,
      fromLabel: 'Start',
      toLabel: 'End',
      startedAt,
      endedAt: startedAt + 4000,
      duration: 4,
      expectedDuration: null,
    });

    await recordTransportSegment({
      transport: 'Test Route',
      fromId: 1,
      toId: 2,
      fromLabel: 'Start',
      toLabel: 'End',
      startedAt,
      endedAt: startedAt + 2000,
      duration: 2,
      expectedDuration: null,
    });

    const segments = await getAllTransportSegments();
    expect(segments.length).toBe(1);
    const [record] = segments;
    expect(record.shortestDuration.duration).toBe(1);
    expect(record.longestDuration.duration).toBe(4);
  });

  test('a reset leg keeps a marker without durations and starts over', async () => {
    const run = (duration: number) => recordTransportSegment({
      transport: 'Test Route', fromId: 1, toId: 2, fromLabel: 'Start', toLabel: 'End',
      startedAt: Date.now(), endedAt: Date.now() + duration * 1000, duration, expectedDuration: null,
    });
    await run(3);

    await deleteTransportSegment('Test Route', 1, 2);

    expect(await getAllTransportSegments()).toEqual([]);
    const [marker] = await getAllTransportSegmentValues();
    expect(marker.resetAt).toEqual(expect.any(Number));
    expect(marker.shortestDuration).toBeUndefined();

    await run(5);
    const [record] = await getAllTransportSegments();
    expect(record.shortestDuration.duration).toBe(5);
    expect(record.longestDuration.duration).toBe(5);
    expect(record.resetAt).toBe(marker.resetAt);
  });
});
