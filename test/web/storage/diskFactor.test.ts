import { describe, expect, it } from 'vitest';
import { diskFactor } from '@web/storage/storageScan.ts';

const MB = 1024 * 1024;
const dbs = (...sizes: number[]) => sizes.map((bytes, index) => ({ name: `db${index}`, bytes, records: 1 }));

describe('diskFactor', () => {
    it('scales the measured data to what IndexedDB takes according to the browser', () => {
        // 602.9 + 184.3 + 20.8 MB of data, stored in 507.6 MB: the case that read as "more than the total".
        const factor = diskFactor(dbs(602.9 * MB, 184.3 * MB, 20.8 * MB), {
            usage: 508.7 * MB,
            quota: 2048 * MB,
            persisted: true,
            details: { indexedDB: 507.6 * MB },
        })!;
        const scaled = [602.9, 184.3, 20.8].map((mb) => mb * MB * factor);
        expect(scaled.reduce((a, b) => a + b, 0)).toBeCloseTo(507.6 * MB, 0);
        expect(scaled[0]).toBeLessThan(508.7 * MB);
    });

    it('falls back to the total where the browser gives no split', () => {
        expect(diskFactor(dbs(200), { usage: 100, quota: 1000, persisted: false })).toBe(0.5);
    });

    it('is unknown without a figure or without anything measured', () => {
        expect(diskFactor(dbs(200), null)).toBeNull();
        expect(diskFactor([], { usage: 100, quota: 1000, persisted: false })).toBeNull();
    });
});
