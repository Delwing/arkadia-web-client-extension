import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fetchDeployedVersion, isSameCommit, watchForNewVersion} from '@web/versionCheck.ts';

function respondWith(sha: string | null, ok = true) {
    return vi.fn().mockResolvedValue({
        ok,
        json: () => Promise.resolve(sha === null ? {} : {sha, date: '2026-01-01'}),
    });
}

describe('isSameCommit', () => {
    it('treats a longer abbreviation of the same commit as equal', () => {
        expect(isSameCommit('abc1234', 'abc12345')).toBe(true);
        expect(isSameCommit('abc1234', 'abc1234')).toBe(true);
    });

    it('tells different commits apart', () => {
        expect(isSameCommit('abc1234', 'abd1234')).toBe(false);
        expect(isSameCommit('', 'abc1234')).toBe(false);
    });
});

describe('fetchDeployedVersion', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('fetches version.json past the cache', async () => {
        const fetchMock = respondWith('abc1234');
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchDeployedVersion()).resolves.toEqual({sha: 'abc1234', date: '2026-01-01'});
        expect(fetchMock.mock.calls[0][0]).toMatch(/\/version\.json$/);
        expect(fetchMock.mock.calls[0][1]).toEqual({cache: 'no-store'});
    });

    it('returns null for an error response, bad payload or network failure', async () => {
        vi.stubGlobal('fetch', respondWith('abc1234', false));
        await expect(fetchDeployedVersion()).resolves.toBeNull();

        vi.stubGlobal('fetch', respondWith(null));
        await expect(fetchDeployedVersion()).resolves.toBeNull();

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        await expect(fetchDeployedVersion()).resolves.toBeNull();
    });
});

describe('watchForNewVersion', () => {
    let stop: () => void = () => {};

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        stop();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('reports a different deployed commit once and stops checking', async () => {
        const fetchMock = respondWith('fff9999');
        vi.stubGlobal('fetch', fetchMock);
        const onUpdate = vi.fn();

        stop = watchForNewVersion({currentSha: 'abc1234', onUpdate, intervalMs: 1000});
        await vi.advanceTimersByTimeAsync(0);

        expect(onUpdate).toHaveBeenCalledWith({sha: 'fff9999', date: '2026-01-01'});

        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    it('stays quiet while the deployed commit is the loaded one, and keeps polling', async () => {
        const fetchMock = respondWith('abc1234');
        vi.stubGlobal('fetch', fetchMock);
        const onUpdate = vi.fn();

        stop = watchForNewVersion({currentSha: 'abc1234', onUpdate, intervalMs: 5 * 60_000});
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(5 * 60_000);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(onUpdate).not.toHaveBeenCalled();
    });

    it('checks again when the app returns to the foreground', async () => {
        const fetchMock = respondWith('abc1234');
        vi.stubGlobal('fetch', fetchMock);
        const onUpdate = vi.fn();

        stop = watchForNewVersion({currentSha: 'abc1234', onUpdate, intervalMs: 60 * 60_000});
        await vi.advanceTimersByTimeAsync(0);

        // Within a minute of the last check: throttled.
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        fetchMock.mockResolvedValue({ok: true, json: () => Promise.resolve({sha: 'fff9999'})});
        await vi.advanceTimersByTimeAsync(2 * 60_000);
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(onUpdate).toHaveBeenCalledWith({sha: 'fff9999', date: ''});
    });

    it('checks right away when a lazily loaded chunk fails', async () => {
        const fetchMock = respondWith('abc1234');
        vi.stubGlobal('fetch', fetchMock);

        stop = watchForNewVersion({currentSha: 'abc1234', onUpdate: vi.fn(), intervalMs: 60 * 60_000});
        await vi.advanceTimersByTimeAsync(0);
        window.dispatchEvent(new Event('vite:preloadError'));
        await vi.advanceTimersByTimeAsync(0);

        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does nothing for a build without a known commit', async () => {
        const fetchMock = respondWith('fff9999');
        vi.stubGlobal('fetch', fetchMock);

        stop = watchForNewVersion({currentSha: 'unknown', onUpdate: vi.fn()});
        await vi.advanceTimersByTimeAsync(60 * 60_000);

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
