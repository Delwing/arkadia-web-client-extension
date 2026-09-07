import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    compareVersions,
    fetchRegistrySummaries,
    isUpdateAvailable,
    parseRegistryBundleUrl,
    registryBundleUrl,
    registryPageUrl,
    reportRegistryInstall,
    searchRegistry,
} from '@shared/marketplace/registryClient.ts';

const REGISTRY = 'https://registry.example';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('registryBundleUrl', () => {
    it('builds the immutable bundle path the client imports', () => {
        expect(registryBundleUrl('combat-alert', '1.2.0', REGISTRY)).toBe(
            'https://registry.example/r/combat-alert/1.2.0/plugin.js',
        );
    });

    it('links to the catalogue page', () => {
        expect(registryPageUrl('combat-alert', REGISTRY)).toBe('https://registry.example/plugins/combat-alert');
    });
});

describe('parseRegistryBundleUrl', () => {
    it('recognises an installed catalogue release', () => {
        expect(parseRegistryBundleUrl(`${REGISTRY}/r/combat-alert/1.2.0/plugin.js`, REGISTRY)).toEqual({
            slug: 'combat-alert',
            version: '1.2.0',
        });
    });

    it('recognises a latest-tracking pin', () => {
        expect(parseRegistryBundleUrl(`${REGISTRY}/r/combat-alert/latest/plugin.js`, REGISTRY)).toEqual({
            slug: 'combat-alert',
            version: 'latest',
        });
    });

    it('refuses the same path on another host', () => {
        expect(parseRegistryBundleUrl('https://evil.example/r/combat-alert/1.2.0/plugin.js', REGISTRY)).toBeNull();
    });

    it('refuses other paths on the registry itself', () => {
        expect(parseRegistryBundleUrl(`${REGISTRY}/r/combat-alert/1.2.0/package.zip`, REGISTRY)).toBeNull();
        expect(parseRegistryBundleUrl(`${REGISTRY}/plugins/combat-alert`, REGISTRY)).toBeNull();
    });

    it('refuses anything that is not a URL', () => {
        expect(parseRegistryBundleUrl('stored-plugin-1234', REGISTRY)).toBeNull();
    });
});

describe('compareVersions', () => {
    it('orders by numeric segments', () => {
        expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
        expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
        expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
    });

    it('treats missing segments as zero', () => {
        expect(compareVersions('1.2', '1.2.0')).toBe(0);
        expect(compareVersions('1.2.1', '1.2')).toBeGreaterThan(0);
    });

    it('ranks a release above its prereleases', () => {
        expect(compareVersions('1.2.0', '1.2.0-rc.1')).toBeGreaterThan(0);
        expect(compareVersions('1.2.0-rc.1', '1.2.0-rc.2')).toBeLessThan(0);
    });

    it('tolerates a v prefix and junk segments', () => {
        expect(compareVersions('v1.3.0', '1.2.0')).toBeGreaterThan(0);
        expect(compareVersions('nonsense', '0.0.0')).toBe(0);
    });
});

describe('isUpdateAvailable', () => {
    it('offers only genuinely newer releases', () => {
        expect(isUpdateAvailable('1.0.0', '1.1.0')).toBe(true);
        expect(isUpdateAvailable('1.1.0', '1.1.0')).toBe(false);
        expect(isUpdateAvailable('1.2.0', '1.1.0')).toBe(false);
    });

    it('says nothing when the catalogue has no release', () => {
        expect(isUpdateAvailable('1.0.0', null)).toBe(false);
        expect(isUpdateAvailable('1.0.0', undefined)).toBe(false);
    });

    it('leaves a latest pin alone - it already follows the newest release', () => {
        expect(isUpdateAvailable('latest', '9.9.9')).toBe(false);
    });
});

describe('searchRegistry', () => {
    it('sends only the parameters that were asked for', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ items: [], total: 0, page: 1, perPage: 24 }), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await searchRegistry({ query: '  walka  ', sort: 'recent', page: 1 }, REGISTRY);

        expect(fetchMock.mock.calls[0][0]).toBe('https://registry.example/api/v1/plugins?q=walka&sort=recent');
    });

    it('reports the registry error message', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Nie znaleziono' }), { status: 404 })),
        );

        await expect(searchRegistry({}, REGISTRY)).rejects.toThrow('Nie znaleziono');
    });

    it('reports a transport failure without leaking the raw error', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

        await expect(searchRegistry({}, REGISTRY)).rejects.toThrow('Nie udalo sie polaczyc z katalogiem pluginow');
    });
});

describe('fetchRegistrySummaries', () => {
    it('asks for the whole installed list in one request', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ items: [{ slug: 'a', latestVersion: '2.0.0' }] }), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const result = await fetchRegistrySummaries(['a', 'b', 'a'], undefined, REGISTRY);

        expect(fetchMock.mock.calls[0][0]).toBe('https://registry.example/api/v1/plugins?slugs=a%2Cb');
        expect(result.get('a')?.latestVersion).toBe('2.0.0');
    });

    it('does not call the API with nothing to ask about', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        expect(await fetchRegistrySummaries([], undefined, REGISTRY)).toEqual(new Map());
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('reportRegistryInstall', () => {
    it('posts the counter and never throws when it fails', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
        vi.stubGlobal('fetch', fetchMock);

        expect(() => reportRegistryInstall('combat-alert', REGISTRY)).not.toThrow();
        expect(fetchMock).toHaveBeenCalledWith(
            'https://registry.example/api/v1/plugins/combat-alert/install',
            expect.objectContaining({ method: 'POST' }),
        );
    });
});
