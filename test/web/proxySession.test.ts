import {
    DEFAULT_SESSION_PROXY_URL,
    getProxySessionId,
    isSessionProxyUrl,
    resetProxySessionId,
    sessionSubprotocols,
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
        expect(sessionSubprotocols('a'.repeat(32))).toEqual([
            'arkadia-session-v1',
            's.' + 'a'.repeat(32),
        ]);
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
