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
 * The id goes in the body rather than the query string for the same reason it rides in a
 * subprotocol on the socket: it is a credential, and URLs are written down everywhere.
 * A plain-text body keeps this a simple request, so no preflight — which a beacon fired
 * during unload would not survive anyway.
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
        return navigator.sendBeacon(url.toString(), new Blob([sessionId], {type: 'text/plain'}));
    } catch {
        return false;
    }
}

/** Marks a client that speaks the framed protocol; also what the proxy selects back. */
export const SESSION_SUBPROTOCOL = 'arkadia-session-v1';

/** Prefix identifying the entry that carries the session id. */
const SESSION_ID_SUBPROTOCOL_PREFIX = 's.';

/**
 * The WebSocket subprotocols that identify this client and its session.
 *
 * The id is a credential, and a query string is the worst place to keep one: it lands in
 * every access log, error page and devtools panel along the way, and staying out of them
 * depends on each hop being configured to strip it. A browser cannot set headers on a
 * WebSocket, but it can set `Sec-WebSocket-Protocol` — which is not logged by default
 * anywhere, and is the conventional carrier for exactly this.
 *
 * Two entries, because they answer different questions: the first says this client
 * understands framing (the proxy selects it back), the second carries the id. A client
 * offering only the id gets the raw byte stream, which is what a `wscat` session testing
 * the proxy by hand wants.
 */
export function sessionSubprotocols(sessionId = getProxySessionId()): string[] {
    return [SESSION_SUBPROTOCOL, SESSION_ID_SUBPROTOCOL_PREFIX + sessionId];
}
