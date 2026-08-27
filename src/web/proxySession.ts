/**
 * Identity for a resumable session on the telnet proxy.
 *
 * The proxy keeps the game connection alive while the browser's socket is gone, and the
 * session id is how a returning client claims it back. That makes the id a credential:
 * anything holding it attaches to a logged-in character, so it is generated with the
 * CSPRNG and never logged whole.
 *
 * It lives in `sessionStorage` rather than `localStorage`, which is a deliberate trade:
 *
 *   - sessionStorage is per tab, so two tabs are two sessions rather than two clients
 *     fighting over one character. The proxy displaces the older attach, and silently
 *     stealing the other tab's connection would be worse than not resuming.
 *   - It survives what actually happens on mobile — a reload, a frozen tab, even the tab
 *     being discarded and restored — which is the case this whole feature exists for.
 *   - It does not survive closing the tab, so that costs a fresh login. Acceptable:
 *     closing the tab is a deliberate act, and the alternative leaks one shared identity
 *     across every tab in the profile.
 */

const STORAGE_KEY = 'proxySessionId';

/**
 * The session proxy to use when nothing is configured.
 *
 * Overridable at build time so a fork, or a second instance, needs no code change.
 */
export const DEFAULT_SESSION_PROXY_URL: string =
    import.meta.env.VITE_SESSION_PROXY_URL ?? 'wss://dargoth-client.wilczyn.ski/attach';

// Nothing forces the proxy on. Choosing proxy mode gets you this one; choosing direct,
// or leaving the default alone, is untouched by any of this.

/** The proxy requires 20-200 characters; 32 hex is 128 bits of entropy. */
function generateId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The id for this tab, created on first use and stable thereafter.
 *
 * Falls back to a per-load id when sessionStorage is unavailable (private modes, storage
 * disabled). Resume stops working in that case, which is exactly the behaviour we have
 * without a proxy at all — no worse, just not better.
 */
export function getProxySessionId(): string {
    try {
        const existing = sessionStorage.getItem(STORAGE_KEY);
        if (existing && existing.length >= 20) return existing;
        const fresh = generateId();
        sessionStorage.setItem(STORAGE_KEY, fresh);
        return fresh;
    } catch {
        return (volatileId ??= generateId());
    }
}

let volatileId: string | undefined;

/**
 * Abandon this session id, so the next connection starts a fresh game session.
 *
 * Used when the player disconnects on purpose: resuming into a character they meant to
 * leave would be a surprise, and the proxy would hold the connection open until its TTL.
 */
export function resetProxySessionId(): void {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Nothing persisted, nothing to clear.
    }
    volatileId = undefined;
}

/**
 * Whether a proxy URL speaks the resumable protocol.
 *
 * The stateless worker proxy and this one are configured through the same setting, so
 * the path is what distinguishes them. Anything else is treated as the old kind, which
 * keeps existing setups working untouched.
 */
export function isSessionProxyUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    try {
        return new URL(url).pathname.endsWith('/attach');
    } catch {
        return false;
    }
}

/**
 * Tell the proxy this client is going away for good.
 *
 * Without it a closed tab leaves the character standing in the world until the session
 * TTL expires — a quarter of an hour of someone else's character idling somewhere they
 * did not choose to be.
 *
 * The proxy closes the session at once. This fires on reload too, and that is fine: a
 * reload starting a fresh login is expected behaviour, so there is nothing worth keeping
 * alive. `sendBeacon` is what makes it work at all — a normal request is cancelled when
 * the page goes, while a beacon is handed to the browser to deliver afterwards.
 *
 * Deliberately not called when the tab is merely hidden. That is the case this whole
 * proxy exists to survive.
 */
export function announceLeaving(baseUrl: string, sessionId = getProxySessionId()): boolean {
    try {
        const url = new URL(baseUrl);
        url.pathname = url.pathname.replace(/\/attach$/, '/leaving');
        url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        url.search = '';
        url.searchParams.set('session', sessionId);
        return navigator.sendBeacon(url.toString());
    } catch {
        return false;
    }
}

/**
 * Add this client's session id and ask for the framed protocol.
 *
 * `v=1` is what opts into headers carrying arrival times; without it the proxy streams
 * raw bytes for older clients. Any session id already in the URL wins, so a hand-crafted
 * one used for testing is left alone.
 */
export function buildSessionProxyUrl(base: string, sessionId = getProxySessionId()): string {
    const url = new URL(base);
    if (!url.searchParams.get('session')) {
        url.searchParams.set('session', sessionId);
    }
    url.searchParams.set('v', '1');
    return url.toString();
}
