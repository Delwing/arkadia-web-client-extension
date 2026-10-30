import { describe, expect, it } from 'vitest';
import {
    parseSubscription,
    removeByEndpoint,
    upsert,
} from '../src/subscriptions';
import type { StoredSubscription, SubscriptionDoc } from '../src/types';

function sub(endpoint: string, createdAt: number): StoredSubscription {
    return { endpoint, p256dh: 'p', auth: 'a', createdAt };
}

const empty: SubscriptionDoc = { secretHash: 'test-hash', subscriptions: [] };

describe('upsert', () => {
    it('replaces rather than duplicates the same endpoint', () => {
        // Re-subscribing one browser yields the same endpoint; appending would
        // make that device receive every alert twice.
        const first = upsert(empty, sub('https://push.test/a', 1), 10);
        const second = upsert(first, sub('https://push.test/a', 2), 10);
        expect(second.subscriptions).toHaveLength(1);
        expect(second.subscriptions[0]!.createdAt).toBe(2);
    });

    it('evicts the oldest past the ceiling and keeps the newcomer', () => {
        let doc = empty;
        for (let i = 1; i <= 4; i++) {
            doc = upsert(doc, sub('https://push.test/' + i, i), 3);
        }
        expect(doc.subscriptions.map(s => s.endpoint)).toEqual([
            'https://push.test/2',
            'https://push.test/3',
            'https://push.test/4',
        ]);
    });
});

describe('removeByEndpoint', () => {
    it('drops only the named endpoint', () => {
        const doc: SubscriptionDoc = {
            secretHash: 'test-hash',
            subscriptions: [sub('https://push.test/a', 1), sub('https://push.test/b', 2)],
        };
        expect(removeByEndpoint(doc, 'https://push.test/a').subscriptions).toHaveLength(1);
        expect(removeByEndpoint(doc, 'https://push.test/missing').subscriptions).toHaveLength(2);
    });
});

describe('parseSubscription', () => {
    const valid = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'key', auth: 'secret' },
    };

    it('accepts what the Push API produces', () => {
        const parsed = parseSubscription(valid, 1234);
        expect(parsed).toMatchObject({
            endpoint: valid.endpoint,
            p256dh: 'key',
            auth: 'secret',
            createdAt: 1234,
        });
    });

    it('rejects a non-https endpoint', () => {
        // The Worker fetches this URL later; http would let a caller aim our
        // outbound requests at an internal service.
        expect(
            parseSubscription({ ...valid, endpoint: 'http://internal.test/x' }, 1),
        ).toBeNull();
    });

    it('rejects missing keys, a bad URL, and non-objects', () => {
        expect(parseSubscription({ ...valid, keys: { p256dh: 'key' } }, 1)).toBeNull();
        expect(parseSubscription({ ...valid, endpoint: 'nonsense' }, 1)).toBeNull();
        expect(parseSubscription(null, 1)).toBeNull();
        expect(parseSubscription('string', 1)).toBeNull();
    });

    it('truncates an oversized device label', () => {
        const parsed = parseSubscription({ ...valid, label: 'x'.repeat(200) }, 1);
        expect(parsed!.label).toHaveLength(64);
    });
});
