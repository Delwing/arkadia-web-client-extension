/**
 * Talking to the push Worker.
 *
 * Everything here is best-effort and never throws at the caller: push is an
 * accessory to the game client, and a Worker that is down or a phone that
 * revoked permission must not surface as an error in the middle of play.
 * Callers get a result object instead.
 */

import { PUSH_WORKER_URL } from './pushConfig';
import {
    loadPushCredentials,
    pushAuthHeader,
    savePushCredentials,
    type PushCredentials,
} from './pushCredentials';
import { vapidPublicKeyBytes } from './vapidKey';

export interface PushMessage {
    title: string;
    body: string;
    url?: string;
}

export interface NotifyResult {
    ok: boolean;
    delivered: number;
    /** Present when the call failed outright, for the settings screen to show. */
    error?: string;
}

export interface PairingOffer {
    /** The short claim code. */
    code: string;
    /** The URL to put in a QR — the code rides in the fragment. */
    url: string;
    expiresInSeconds: number;
}

async function call(
    path: string,
    body: unknown,
    options: { auth?: boolean } = { auth: true },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.auth !== false) {
        const authorization = pushAuthHeader();
        if (authorization) headers.authorization = authorization;
    }

    try {
        const response = await fetch(`${PUSH_WORKER_URL}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body ?? {}),
        });
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: response.ok, status: response.status, data };
    } catch {
        return { ok: false, status: 0, data: {} };
    }
}

/** Is the Push API usable here at all? */
export function isPushSupported(): boolean {
    return (
        typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        typeof window !== 'undefined' &&
        'PushManager' in window &&
        typeof Notification !== 'undefined'
    );
}

async function currentSubscription(): Promise<PushSubscription | null> {
    if (!isPushSupported()) return null;
    try {
        const registration = await navigator.serviceWorker.ready;
        return await registration.pushManager.getSubscription();
    } catch {
        return null;
    }
}

/** Does this browser currently receive pushes? */
export async function isPushEnabled(): Promise<boolean> {
    return (await currentSubscription()) !== null && loadPushCredentials() !== null;
}

/**
 * Subscribe this browser and register it with the Worker.
 *
 * With no credential stored the Worker mints an account and returns it. With
 * one, this browser joins the account that already exists — which is what a
 * device that has just claimed a pairing code does.
 */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
    if (!isPushSupported()) {
        return { ok: false, error: 'unsupported' };
    }

    // Must happen in response to a user gesture; browsers reject a bare
    // page-load request, so this function has to be called from a click.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        return { ok: false, error: permission };
    }

    let subscription: PushSubscription;
    try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        subscription =
            existing ??
            (await registration.pushManager.subscribe({
                // Mandatory in Chrome. A push that shows nothing eventually
                // costs the subscription, so there is no silent variant.
                userVisibleOnly: true,
                applicationServerKey: vapidPublicKeyBytes(),
            }));
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'subscribe_failed' };
    }

    const payload = subscription.toJSON();
    const result = await call('/push/subscribe', {
        subscription: { ...payload, label: deviceLabel() },
    });

    if (!result.ok) {
        return { ok: false, error: String(result.data.message ?? 'worker_error') };
    }
    if (typeof result.data.pushSecret === 'string' && typeof result.data.pushId === 'string') {
        savePushCredentials({
            pushId: result.data.pushId,
            pushSecret: result.data.pushSecret,
        });
    }
    return { ok: true };
}

/** Stop this browser receiving pushes. Leaves the account and other devices alone. */
export async function disablePush(): Promise<void> {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await call('/push/unsubscribe', { endpoint: subscription.endpoint });
    try {
        await subscription.unsubscribe();
    } catch {
        // The browser may have dropped it already; the Worker copy is gone
        // either way, which is what matters.
    }
}

/** Fan an alert out to every device on this account. */
export async function sendPush(message: PushMessage): Promise<NotifyResult> {
    if (!loadPushCredentials()) {
        return { ok: false, delivered: 0, error: 'no_account' };
    }
    const result = await call('/push/notify', message);
    if (!result.ok) {
        return {
            ok: false,
            delivered: 0,
            error: String(result.data.message ?? `http_${result.status}`),
        };
    }
    return { ok: true, delivered: Number(result.data.delivered ?? 0) };
}

/**
 * Ask the Worker for a pairing code and build the URL a QR should encode.
 *
 * The code goes in the fragment: browsers never transmit it, so it reaches the
 * Worker only in the request that redeems it.
 */
export async function startPairing(): Promise<PairingOffer | null> {
    const result = await call('/push/pair/start', {});
    if (!result.ok || typeof result.data.code !== 'string') return null;

    // Called without a credential the Worker mints one, so this device can
    // start pairing before it has subscribed to anything.
    if (typeof result.data.pushSecret === 'string' && typeof result.data.pushId === 'string') {
        savePushCredentials({
            pushId: result.data.pushId,
            pushSecret: result.data.pushSecret,
        });
    }

    const base = `${window.location.origin}${window.location.pathname}`;
    return {
        code: result.data.code,
        url: `${base}#push-pair=${result.data.code}`,
        expiresInSeconds: Number(result.data.expiresInSeconds ?? 300),
    };
}

/** Redeem a pairing code, adopting the account it belongs to. */
export async function claimPairing(code: string): Promise<PushCredentials | null> {
    const result = await call('/push/pair/claim', { code }, { auth: false });
    if (
        !result.ok ||
        typeof result.data.pushId !== 'string' ||
        typeof result.data.pushSecret !== 'string'
    ) {
        return null;
    }
    const credentials = {
        pushId: result.data.pushId,
        pushSecret: result.data.pushSecret,
    };
    savePushCredentials(credentials);
    return credentials;
}

/**
 * Adopt a pairing code sitting in the page fragment, then strip it.
 *
 * Returns true when this call actually claimed one. The fragment is cleared
 * either way: the code is single use, so a reload must not retry a burned one.
 */
export async function claimPairingFromLocation(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const match = /[#&]push-pair=([A-Za-z0-9]+)/.exec(window.location.hash);
    if (!match) return false;

    window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
    );
    return (await claimPairing(match[1]!)) !== null;
}

function deviceLabel(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    return navigator.userAgent.slice(0, 60);
}
