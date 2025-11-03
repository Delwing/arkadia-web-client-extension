import { clearTransportStats, getAllTransportSegments, recordTransportSegment } from '@client/utils/transportStats';

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
});
