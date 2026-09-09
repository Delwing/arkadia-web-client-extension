/**
 * The per-user subscription document.
 *
 * One KV key per user (`push:{uid}`) holding every device that user has
 * registered. A single document rather than a key per device, for two reasons:
 * the Worker's minimal KV shape has no `list()`, and the delivery path then
 * costs exactly one read regardless of how many devices are registered.
 *
 * The mutation helpers are pure so they can be tested without KV at all.
 */

import type { KVNamespace, StoredSubscription, SubscriptionDoc } from './types';

export function docKey(pushId: string): string {
    return `push:${pushId}`;
}

/** Returns null when the account does not exist. */
export async function readDoc(
    kv: KVNamespace | undefined,
    pushId: string,
): Promise<SubscriptionDoc | null> {
    if (!kv) return null;
    const raw = await kv.get(docKey(pushId), 'text');
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as SubscriptionDoc;
        if (typeof parsed?.secretHash !== 'string' || !Array.isArray(parsed?.subscriptions)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/**
 * The account document persists even with zero subscriptions: deleting it would
 * invalidate the credential the user's other devices still hold.
 */
export async function writeDoc(
    kv: KVNamespace | undefined,
    pushId: string,
    doc: SubscriptionDoc,
): Promise<void> {
    if (!kv) return;
    await kv.put(docKey(pushId), JSON.stringify(doc));
}

/**
 * Add or replace a subscription, keyed by endpoint.
 *
 * Re-subscribing the same browser produces the same endpoint, so this is an
 * upsert rather than an append — otherwise a user who toggles the setting a few
 * times would get duplicate notifications on one device.
 */
export function upsert(
    doc: SubscriptionDoc,
    subscription: StoredSubscription,
    max: number,
): SubscriptionDoc {
    const others = doc.subscriptions.filter(s => s.endpoint !== subscription.endpoint);
    const next = [...others, subscription];
    // Evict oldest first, so the device that just subscribed always survives.
    next.sort((a, b) => a.createdAt - b.createdAt);
    // Spread the doc so `secretHash` survives — rebuilding the object from
    // scratch here would silently invalidate the account's credential.
    return { ...doc, subscriptions: next.slice(Math.max(0, next.length - max)) };
}

export function removeByEndpoint(doc: SubscriptionDoc, endpoint: string): SubscriptionDoc {
    return { ...doc, subscriptions: doc.subscriptions.filter(s => s.endpoint !== endpoint) };
}

/**
 * Validate what the browser sent before it reaches storage.
 *
 * The endpoint is fetched by the Worker later, so an unvalidated value here
 * would let a caller aim our outbound requests at an arbitrary host.
 */
export function parseSubscription(input: unknown, now: number): StoredSubscription | null {
    if (typeof input !== 'object' || input === null) return null;
    const raw = input as Record<string, unknown>;
    const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint : '';
    const keys = (raw.keys ?? {}) as Record<string, unknown>;
    const p256dh = typeof keys.p256dh === 'string' ? keys.p256dh : '';
    const auth = typeof keys.auth === 'string' ? keys.auth : '';
    if (!endpoint || !p256dh || !auth) return null;

    let parsed: URL;
    try {
        parsed = new URL(endpoint);
    } catch {
        return null;
    }
    // https only: a push endpoint is always https, and this stops the stored
    // value being used to probe internal http services.
    if (parsed.protocol !== 'https:') return null;

    const label = typeof raw.label === 'string' ? raw.label.slice(0, 64) : undefined;
    return { endpoint, p256dh, auth, label, createdAt: now };
}
