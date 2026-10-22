import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import eventBus from '@modules/core/eventBus';
import PingTracker from '@web/PingTracker';
import type { PingSample } from '@shared/events/clientEvents';

/**
 * The latency ping only feeds the connection chip, and on mobile data one every
 * few seconds keeps the modem awake, so how often it goes out is a per-device
 * setting that must apply to a live connection without reconnecting.
 */
describe('PingTracker', () => {
    let sent: number;
    let trackers: PingTracker[];

    const track = (seconds: number) => {
        const tracker = new PingTracker(() => { sent += 1; }, seconds);
        trackers.push(tracker);
        return tracker;
    };

    beforeEach(() => {
        vi.useFakeTimers();
        sent = 0;
        trackers = [];
    });

    afterEach(() => {
        trackers.forEach((t) => t.stop());
        vi.useRealTimers();
    });

    it('pings on connect and then once per interval', () => {
        track(10).start();
        expect(sent).toBe(1);
        vi.advanceTimersByTime(9_999);
        expect(sent).toBe(1);
        vi.advanceTimersByTime(1);
        expect(sent).toBe(2);
    });

    it('sends nothing at all when turned off', () => {
        track(0).start();
        vi.advanceTimersByTime(60_000);
        expect(sent).toBe(0);
    });

    it('switches a live connection to the new interval', () => {
        const tracker = track(3);
        tracker.start();
        tracker.setInterval(30);
        expect(sent).toBe(2);
        vi.advanceTimersByTime(29_000);
        expect(sent).toBe(2);
        vi.advanceTimersByTime(1_000);
        expect(sent).toBe(3);
    });

    it('clears the chip when turned off mid-connection', () => {
        const tracker = track(3);
        const readings: (number | null)[] = [];
        const onPing = (v: number | null) => readings.push(v);
        eventBus.on('ping', onPing);
        tracker.start();
        eventBus.emit('gmcp.core.ping');
        tracker.setInterval(0);
        vi.advanceTimersByTime(60_000);
        eventBus.off('ping', onPing);
        expect(sent).toBe(1);
        expect(readings.at(-1)).toBeNull();
    });

    it('leaves a stopped tracker stopped when the interval changes', () => {
        const tracker = track(3);
        tracker.setInterval(10);
        vi.advanceTimersByTime(60_000);
        expect(sent).toBe(0);
    });

    it('marks the first round trip after connecting so the graph breaks there', () => {
        const tracker = track(3);
        let samples: PingSample[] = [];
        const onHistory = (h: { samples: PingSample[] }) => { samples = h.samples; };
        eventBus.on('pingHistory', onHistory);
        tracker.start();
        eventBus.emit('gmcp.core.ping');
        vi.advanceTimersByTime(3_000);
        eventBus.emit('gmcp.core.ping');
        tracker.start();
        eventBus.emit('gmcp.core.ping');
        eventBus.off('pingHistory', onHistory);
        expect(samples.map((s) => s.restart === true)).toEqual([true, false, true]);
    });
});
