import {
    DEFAULT_SESSION_PROXY_URL,
    getProxySessionId,
    isSessionProxyUrl,
    resetProxySessionId,
    sessionSubprotocols,
    shouldReattachAfterClose,
} from '@web/proxySession.ts';

describe('proxy session identity', () => {
    beforeEach(() => {
        sessionStorage.clear();
        resetProxySessionId();
    });

    it('is stable across calls, so a reconnect claims the same session', () => {
        const first = getProxySessionId();

        expect(getProxySessionId()).toBe(first);
    });

    it('survives a reload — the whole point, since a frozen tab reconnects', () => {
        const before = getProxySessionId();

        // A reload keeps sessionStorage but loses every module-level variable.
        const stored = sessionStorage.getItem('proxySessionId');
        resetProxySessionId();
        sessionStorage.setItem('proxySessionId', stored!);

        expect(getProxySessionId()).toBe(before);
    });

    it('meets the length the proxy demands of a credential', () => {
        const id = getProxySessionId();

        expect(id.length).toBeGreaterThanOrEqual(20);
        expect(id).toMatch(/^[0-9a-f]+$/);
    });

    it('starts fresh after a deliberate disconnect', () => {
        const before = getProxySessionId();
        resetProxySessionId();

        expect(getProxySessionId()).not.toBe(before);
    });
});


describe('isSessionProxyUrl', () => {
    it('recognises the resumable proxy by its path', () => {
        expect(isSessionProxyUrl('wss://proxy.example.com/attach')).toBe(true);
        expect(isSessionProxyUrl('wss://proxy.example.com/attach?session=abc')).toBe(true);
    });

    it('leaves the stateless worker proxy alone', () => {
        // Both are configured through the same setting, so misreading one as the other
        // would frame a stream that carries no headers.
        expect(isSessionProxyUrl('wss://arkadia-proxy.delwing.workers.dev?host=arkadia.rpg.pl&port=23')).toBe(false);
        expect(isSessionProxyUrl('wss://arkadia.rpg.pl/wss')).toBe(false);
    });

    it('treats nonsense as not-a-session-proxy rather than throwing', () => {
        expect(isSessionProxyUrl('not a url')).toBe(false);
        expect(isSessionProxyUrl(null)).toBe(false);
        expect(isSessionProxyUrl(undefined)).toBe(false);
    });
});

describe('sessionSubprotocols', () => {
    beforeEach(() => {
        sessionStorage.clear();
        resetProxySessionId();
    });

    it('offers the framed protocol first, then the id', () => {
        const offered = sessionSubprotocols('a'.repeat(32));

        expect(offered[0]).toBe('arkadia-session-v1');
        expect(offered[1]).toBe('s.' + 'a'.repeat(32));
    });

    /*
     * So a "it dropped me" report can be checked against what that tab was running,
     * rather than guessed at from when it was sent.
     */
    it('reports the build, which the proxy shows against the session', () => {
        const build = sessionSubprotocols().find(v => v.startsWith('b.'));

        expect(build).toBeDefined();
        expect(build!.length).toBeGreaterThan(2);
    });

    it('defaults to this tab\'s session, so a reconnect claims the same one', () => {
        const id = getProxySessionId();

        expect(sessionSubprotocols()[1]).toBe('s.' + id);
    });

    /*
     * The point of the exercise. A credential in a query string is written into every
     * access log, error page and devtools panel between here and the proxy, and staying
     * out of them depends on each hop being configured to strip it.
     */
    it('keeps the credential out of the URL entirely', () => {
        const id = getProxySessionId();

        expect(DEFAULT_SESSION_PROXY_URL).not.toContain(id);
        expect(DEFAULT_SESSION_PROXY_URL).not.toContain('session=');
        expect(sessionSubprotocols().join(',')).toContain(id);
    });

    it('produces entries usable as HTTP tokens, which the header demands', () => {
        for (const value of sessionSubprotocols()) {
            expect(value).toMatch(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/);
        }
    });
});

describe('shouldReattachAfterClose', () => {
    const state = (over: Partial<Parameters<typeof shouldReattachAfterClose>[0]> = {}) => ({
        usesSessionProxy: true,
        closedByUser: false,
        sessionEndedByGame: false,
        ...over,
    });

    /*
     * The case the proxy exists for: a phone froze the tab, the socket died, the game
     * connection did not. The player pressed nothing and should have to press nothing.
     */
    it('reattaches when the browser lost its socket behind a session proxy', () => {
        expect(shouldReattachAfterClose(state())).toBe(true);
    });

    it('stays put without a session proxy, where a reconnect means a login prompt', () => {
        expect(shouldReattachAfterClose(state({usesSessionProxy: false}))).toBe(false);
    });

    it('respects a deliberate disconnect rather than resuming what was left', () => {
        expect(shouldReattachAfterClose(state({closedByUser: true}))).toBe(false);
    });

    /*
     * The proxy holds an ended session precisely so the player can read the game's own
     * "zostajesz rozlaczony z powodu bezczynnosci". Reconnecting buries it.
     */
    it('does not reconnect over the game\'s own parting words', () => {
        expect(shouldReattachAfterClose(state({sessionEndedByGame: true}))).toBe(false);
    });
});

describe('resume offset', () => {
    /*
     * The proxy cannot work out what reached the screen: a write there lands in a kernel
     * buffer, and the renderer that would draw it is the part that freezes. Only this end
     * knows, so it says so and the proxy replays from exactly there.
     */
    it('reports how far this client got, so a resume repeats nothing', () => {
        const offered = sessionSubprotocols('a'.repeat(32), 4096);

        expect(offered).toContain('o.4096');
    });

    it('says nothing when it has read nothing, so a fresh session starts at the top', () => {
        const offered = sessionSubprotocols('a'.repeat(32), 0);

        expect(offered.some(v => v.startsWith('o.'))).toBe(false);
    });
});
