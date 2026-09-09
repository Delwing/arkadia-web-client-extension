/**
 * Talking to the push Worker.
 *
 * Everything here is best-effort and never throws at the caller: push is an
 * accessory to the game client, and a Worker that is down or a phone that
 * revoked permission must not surface as an error in the middle of play.
 * Callers get a result object instead.
 */

import { getBehaviorSettings } from '@modules/core/settings';
import { PUSH_WORKER_URL } from './pushConfig';
import {
    loadPushCredentials,
    pushAuthHeader,
    savePushCredentials,
    type PushCredentials,
} from './pushCredentials';
import { vapidPublicKeyBytes } from './vapidKey';

/**
 * Minimum gap between pushes, across every sender.
 *
 * It lives here rather than in any one caller because every path — the hp
 * alert, a user's trigger macro, a plugin — points at the same phone. A limit
 * held by one caller only protects against that caller.
 */
const PUSH_COOLDOWN_MS = 60_000;

let lastPushAt = 0;

/** Test seam: forget the cooldown. */
export function resetPushCooldown(): void {
    lastPushAt = 0;
}

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
        // getRegistration(), never `ready`: `ready` hangs forever when nothing
        // is registered yet rather than rejecting, so any caller awaiting it on
        // a fresh browser would wait for good.
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return null;
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

    // `denied` is terminal and worth separating: requestPermission() resolves
    // immediately as denied without showing anything, and a page can never
    // re-prompt its way out. Only site settings can undo it, so telling the
    // player to "try again" would be a lie.
    if (Notification.permission === 'denied') {
        return { ok: false, error: 'denied' };
    }

    // Already granted short-circuits without a prompt, which is what makes
    // auto-enabling on a pairing load work on a device that has said yes before.
    if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            // Not necessarily a refusal. Firefox and Safari require a real user
            // gesture here, and this runs on page load after a QR scan, so a
            // gesture-less call is reported as a non-grant too. Both cases are
            // fixed the same way — press the button in settings — so they share
            // an outcome distinct from the terminal `denied` above.
            return { ok: false, error: 'not_granted' };
        }
    }

    let subscription: PushSubscription;
    try {
        // Register before awaiting `ready`. Nothing guarantees the service
        // worker is already registered — NotificationManager only does it when
        // local notifications are switched on — and `ready` never resolves if
        // it is not, so without this the button hangs silently on a browser
        // that has not enabled them. register() is idempotent.
        await navigator.serviceWorker.register('sw.js');
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

/**
 * Fan an alert out to every device on this account.
 *
 * Rate limited: an AFK player takes damage repeatedly and `hpAlert` fires on
 * every drop, so without this one fight becomes a phone that buzzes for a
 * minute straight and a burst the push service would rather rate-limit itself.
 */
export async function sendPush(
    message: PushMessage,
    options: { bypassCooldown?: boolean; ignoreVisibilityGate?: boolean } = {},
): Promise<NotifyResult> {
    if (!loadPushCredentials()) {
        return { ok: false, delivered: 0, error: 'no_account' };
    }

    // Off by default, so this normally sends whether or not the tab is focused.
    // The gate lives here rather than in any one caller so it covers every push
    // the client makes, and it is checked before the cooldown so a suppressed
    // send does not consume the budget.
    if (
        !options.ignoreVisibilityGate &&
        getBehaviorSettings().pushOnlyWhenHidden &&
        typeof document !== 'undefined' &&
        document.visibilityState !== 'hidden'
    ) {
        return { ok: false, delivered: 0, error: 'tab_visible' };
    }

    if (!options.bypassCooldown) {
        const now = Date.now();
        if (now - lastPushAt < PUSH_COOLDOWN_MS) {
            return { ok: false, delivered: 0, error: 'cooldown' };
        }
        // Recorded before awaiting, so a burst in one tick cannot all slip through.
        lastPushAt = now;
    }
    // A bypassing send deliberately does not stamp `lastPushAt` either: it is
    // exempt from the limit, so it should not consume the ordinary budget and
    // suppress the next automatic alert for a minute.

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

export type PairingOutcome =
    /** No pairing code in the URL — the normal case on every other load. */
    | { status: 'none' }
    /** There was a code, but it was invalid, expired or already used. */
    | { status: 'expired' }
    /** The credential is adopted. Switching on receiving is the next step. */
    | { status: 'claimed' };

/**
 * Adopt a pairing code sitting in the page fragment.
 *
 * Deliberately stops short of enabling. The caller should do that immediately —
 * scanning the QR *is* the decision to receive on this device — but it must be
 * able to confirm the pairing first: enabling raises the browser's permission
 * prompt, and `Notification.requestPermission()` does not settle while that
 * prompt sits unanswered. Awaiting it before saying anything would make an
 * ignored prompt look exactly like a pairing that silently failed.
 *
 * The fragment is cleared either way: the code is single use, so a reload must
 * not retry a burned one.
 */
export async function claimPairingFromLocation(): Promise<PairingOutcome> {
    if (typeof window === 'undefined') return { status: 'none' };
    const match = /[#&]push-pair=([A-Za-z0-9]+)/.exec(window.location.hash);
    if (!match) return { status: 'none' };

    window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
    );

    return (await claimPairing(match[1]!)) === null
        ? { status: 'expired' }
        : { status: 'claimed' };
}

function deviceLabel(): string {
    if (typeof navigator === 'undefined') return 'unknown';
    return navigator.userAgent.slice(0, 60);
}
