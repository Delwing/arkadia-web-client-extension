import {
    buildSessionProxyUrl,
    getProxySessionId,
    isSessionProxyUrl,
    resetProxySessionId,
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

describe('buildSessionProxyUrl', () => {
    beforeEach(() => {
        sessionStorage.clear();
        resetProxySessionId();
    });

    it('adds the session id and asks for the framed protocol', () => {
        const url = new URL(buildSessionProxyUrl('wss://proxy.example.com/attach', 'a'.repeat(32)));

        expect(url.searchParams.get('session')).toBe('a'.repeat(32));
        expect(url.searchParams.get('v')).toBe('1');
    });

    it('keeps a session id already in the URL, so hand-set test values survive', () => {
        const url = new URL(buildSessionProxyUrl('wss://proxy.example.com/attach?session=mine', 'b'.repeat(32)));

        expect(url.searchParams.get('session')).toBe('mine');
        expect(url.searchParams.get('v')).toBe('1');
    });

    it('preserves other query parameters', () => {
        const url = new URL(buildSessionProxyUrl('wss://proxy.example.com/attach?host=arkadia.rpg.pl'));

        expect(url.searchParams.get('host')).toBe('arkadia.rpg.pl');
    });
});
