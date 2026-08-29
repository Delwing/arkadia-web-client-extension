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

/**
 * Whether a closed socket should be reattached without asking the player.
 *
 * Silently reconnecting is right in exactly one situation and wrong in the rest, so the
 * conditions are here rather than inline: only a session proxy can hand a player back
 * the character they had, and only when the session is still there to reclaim.
 *
 *   - Without one, a reconnect lands on a login prompt nobody asked for.
 *   - After a deliberate disconnect, resuming a character they chose to leave would be
 *     a surprise — and the id is dropped then anyway, so it would be a fresh login.
 *   - Once the game has ended the session, the replay just delivered explains why. A
 *     reconnect would open a new connection and bury it under a login banner.
 */
export function shouldReattachAfterClose(state: {
    usesSessionProxy: boolean;
    closedByUser: boolean;
    sessionEndedByGame: boolean;
}): boolean {
    return state.usesSessionProxy && !state.closedByUser && !state.sessionEndedByGame;
}

const RESUME_NOTICE_KEY = 'proxyResumeNotice';

/**
 * Whether to announce a resumed session in the output.
 *
 * On by default, because the first few times it happens the player needs telling: they
 * pressed nothing, and a silent reattach is indistinguishable from the client having sat
 * there doing nothing. Once it is plainly working, it becomes a line of noise on every
 * return to the tab — which on a phone is often — so it can be turned off.
 *
 * A lost-output warning is not covered by this and always shows. That one is not routine.
 */
export function isResumeNoticeEnabled(): boolean {
    try {
        return localStorage.getItem(RESUME_NOTICE_KEY) !== 'false';
    } catch {
        return true;
    }
}

export function setResumeNoticeEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(RESUME_NOTICE_KEY, String(enabled));
    } catch {
        // Storage unavailable; the default stands for this session.
    }
}

/** Marks a client that speaks the framed protocol; also what the proxy selects back. */
export const SESSION_SUBPROTOCOL = 'arkadia-session-v1';

/** Prefix identifying the entry that carries the session id. */
const SESSION_ID_SUBPROTOCOL_PREFIX = 's.';

/** Prefix identifying the entry that carries the client build. */
const BUILD_SUBPROTOCOL_PREFIX = 'b.';

/** Prefix identifying the entry that carries how much output this client has read. */
const OFFSET_SUBPROTOCOL_PREFIX = 'o.';

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
export function sessionSubprotocols(sessionId = getProxySessionId(), processedBytes = 0): string[] {
    const offered = [SESSION_SUBPROTOCOL, SESSION_ID_SUBPROTOCOL_PREFIX + sessionId];
    /*
     * How far this client actually got.
     *
     * The proxy cannot work this out for itself. A write succeeding there means the
     * bytes reached a kernel buffer, not a screen — and the renderer that would have
     * drawn them is the one part of the chain that freezes, while every layer beneath
     * it keeps accepting data quite happily. A line was lost exactly that way.
     *
     * So this end counts what it has processed and says so on the way back in, and the
     * proxy replays from there: nothing missed, nothing repeated. Same idea as a TCP
     * sequence number or `Last-Event-ID`, and one integer covers it.
     */
    if (processedBytes > 0) offered.push(OFFSET_SUBPROTOCOL_PREFIX + processedBytes);
    // Which build is on the other end. A report of "it dropped me" is hard to act on
    // without knowing whether that tab was running the fix, and the answer is otherwise
    // guessed at from when the report arrived. Kept to a token — the commit sha is hex —
    // since a subprotocol value cannot carry anything else.
    const build = typeof __COMMIT_SHA__ === 'string' ? __COMMIT_SHA__.replace(/[^0-9a-zA-Z]/g, '') : '';
    if (build) offered.push(BUILD_SUBPROTOCOL_PREFIX + build);
    return offered;
}
