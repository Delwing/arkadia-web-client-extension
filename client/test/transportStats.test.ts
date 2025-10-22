import { clearTransportStats, getAllTransportSegments, recordTransportSegment } from '../src/utils/transportStats';

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
    const latest = segments[segments.length - 1];
    expect(latest.transport).toBe('Test Route');
    expect(latest.duration).toBe(1);
    expect(latest.expectedDuration).toBeNull();
  });
});
