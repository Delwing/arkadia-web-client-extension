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
