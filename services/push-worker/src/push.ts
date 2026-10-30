/**
 * Delivery to a push service (RFC 8030), with an RFC 8291 encrypted payload.
 *
 * The push service relays a body it cannot read: the message is encrypted here
 * against the subscription's own key material, so only the browser that created
 * the subscription can decrypt it. See encrypt.ts.
 */

import { encryptPayload, MAX_PLAINTEXT_BYTES } from './encrypt';
import { audienceFor, vapidAuthHeader, type VapidKey } from './vapid';
import type { StoredSubscription } from './types';

/**
 * How long the push service should hold the message for a disconnected device.
 *
 * Deliberately short: "you are taking damage" is worthless ten minutes late, and
 * a stale alert firing when the player is already dead is worse than none.
 */
const DEFAULT_TTL_SECONDS = 120;

export type DeliveryOutcome =
    /** Accepted by the push service. */
    | 'delivered'
    /** Subscription no longer exists — the caller must drop it from storage. */
    | 'gone'
    /** Anything else; the subscription is kept and the failure logged. */
    | 'failed';

export interface DeliveryResult {
    endpoint: string;
    outcome: DeliveryOutcome;
    httpStatus: number;
}

export interface PushMessage {
    title: string;
    body: string;
    url?: string;
}

export interface SendOptions {
    ttlSeconds?: number;
    /** Injectable for tests; defaults to the global fetch. */
    fetchImpl?: typeof fetch;
    now?: number;
}

export async function sendPush(
    subscription: StoredSubscription,
    key: VapidKey,
    subject: string,
    message: PushMessage,
    options: SendOptions = {},
): Promise<DeliveryResult> {
    const doFetch = options.fetchImpl ?? fetch;
    const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

    let authorization: string;
    try {
        authorization = await vapidAuthHeader(
            key,
            audienceFor(subscription.endpoint),
            subject,
            options.now,
        );
    } catch {
        return { endpoint: subscription.endpoint, outcome: 'failed', httpStatus: 0 };
    }

    let body: Uint8Array<ArrayBuffer>;
    try {
        body = await encryptPayload(buildPlaintext(message), subscription.p256dh, subscription.auth);
    } catch {
        // Corrupt stored key material, or a payload that would not fit. Neither
        // is retryable and neither says the subscription is dead, so it stays.
        return { endpoint: subscription.endpoint, outcome: 'failed', httpStatus: 0 };
    }

    const headers: Record<string, string> = {
        authorization,
        ttl: String(ttl),
        // Tells the push service this is worth waking a dozing device for.
        urgency: 'high',
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
    };

    let response: Response;
    try {
        response = await doFetch(subscription.endpoint, { method: 'POST', headers, body });
    } catch {
        // Network failure reaching the push service. Keep the subscription:
        // this says nothing about whether it is still valid.
        return { endpoint: subscription.endpoint, outcome: 'failed', httpStatus: 0 };
    }

    return {
        endpoint: subscription.endpoint,
        outcome: classify(response.status),
        httpStatus: response.status,
    };
}

/**
 * 404 and 410 are the two the spec defines as "this subscription is dead" —
 * the user revoked permission, cleared site data, or the browser rotated it.
 * Everything else is transient and must not cost the user their registration.
 */
function classify(status: number): DeliveryOutcome {
    if (status >= 200 && status < 300) return 'delivered';
    if (status === 404 || status === 410) return 'gone';
    return 'failed';
}

/**
 * The JSON the service worker reads out of `event.data`.
 *
 * Callers already cap the individual fields, but the encrypted record has a
 * hard ceiling, so the assembled JSON is trimmed here as a last resort rather
 * than throwing away the whole notification.
 */
function buildPlaintext(message: PushMessage): string {
    const payload: Record<string, string> = { title: message.title, body: message.body };
    if (message.url) payload.url = message.url;

    let json = JSON.stringify(payload);
    if (new TextEncoder().encode(json).length <= MAX_PLAINTEXT_BYTES) return json;

    // Drop the body down until it fits. The title is the part a glanced-at
    // notification actually shows, so it is the last thing to go.
    let text = payload.body ?? '';
    while (text.length > 0 && new TextEncoder().encode(json).length > MAX_PLAINTEXT_BYTES) {
        text = text.slice(0, Math.floor(text.length / 2));
        json = JSON.stringify({ ...payload, body: text });
    }
    return json;
}
