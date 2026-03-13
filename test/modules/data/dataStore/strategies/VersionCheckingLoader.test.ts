import {
  VersionCheckingLoader,
  extractGitHubReleaseTag,
  GITHUB_RELEASES_LATEST_URL,
} from '@modules/data/dataStore/strategies/VersionCheckingLoader';
import { LoaderContext, LoaderStrategy, RefreshMetadata } from '@modules/data/dataStore/types';

type Snap = { value: number };
type Meta = RefreshMetadata & { hash?: string };

function makeInner(snapshot: Snap = { value: 1 }): LoaderStrategy<Snap, Meta> {
  return {
    load: jest.fn(async (ctx: LoaderContext<Snap, Meta>) => ({
      snapshot,
      metadata: ctx.metadata,
    })),
  };
}

function makeVersionResponse(version: string): Response {
  return {
    ok: true,
    json: jest.fn(async () => ({ tag_name: version })),
  } as unknown as Response;
}

function makeFailResponse(): Response {
  return {
    ok: false,
    json: jest.fn(async () => ({})),
  } as unknown as Response;
}

function makeContext(overrides: Partial<LoaderContext<Snap, Meta>> = {}): LoaderContext<Snap, Meta> {
  return {
    previousSnapshot: undefined,
    metadata: undefined,
    force: false,
    onProgress: undefined,
    ...overrides,
  };
}

describe('VersionCheckingLoader', () => {
  describe('when the hash is unchanged', () => {
    it('skips inner load and returns previous snapshot when hash matches', async () => {
      const prevSnapshot: Snap = { value: 10 };
      const inner = makeInner();
      const fetchImpl = jest.fn(async () => makeVersionResponse('v1.0'));

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const result = await loader.load(makeContext({
        previousSnapshot: prevSnapshot,
        metadata: { refreshedAt: 0, hash: 'v1.0' },
      }));

      expect(inner.load).not.toHaveBeenCalled();
      expect(result.snapshot).toBe(prevSnapshot);
      expect(result.metadata?.hash).toBe('v1.0');
    });

    it('calls inner load when hash has changed', async () => {
      const prevSnapshot: Snap = { value: 10 };
      const newSnapshot: Snap = { value: 20 };
      const inner = makeInner(newSnapshot);
      const fetchImpl = jest.fn(async () => makeVersionResponse('v2.0'));

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const result = await loader.load(makeContext({
        previousSnapshot: prevSnapshot,
        metadata: { refreshedAt: 0, hash: 'v1.0' },
      }));

      expect(inner.load).toHaveBeenCalledTimes(1);
      expect(result.snapshot).toEqual(newSnapshot);
      expect(result.metadata?.hash).toBe('v2.0');
    });
  });

  describe('when there is no previous snapshot', () => {
    it('calls inner load even when hash matches (no snapshot to return)', async () => {
      const freshSnapshot: Snap = { value: 5 };
      const inner = makeInner(freshSnapshot);
      const fetchImpl = jest.fn(async () => makeVersionResponse('v1.0'));

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const result = await loader.load(makeContext({
        previousSnapshot: undefined,
        metadata: { refreshedAt: 0, hash: 'v1.0' },
      }));

      expect(inner.load).toHaveBeenCalledTimes(1);
      expect(result.snapshot).toEqual(freshSnapshot);
    });
  });

  describe('force flag', () => {
    it('bypasses hash check and calls inner load when force is true', async () => {
      const prevSnapshot: Snap = { value: 10 };
      const freshSnapshot: Snap = { value: 99 };
      const inner = makeInner(freshSnapshot);
      const fetchImpl = jest.fn(async () => makeVersionResponse('v1.0'));

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const result = await loader.load(makeContext({
        previousSnapshot: prevSnapshot,
        metadata: { refreshedAt: 0, hash: 'v1.0' },
        force: true,
      }));

      expect(inner.load).toHaveBeenCalledTimes(1);
      expect(result.snapshot).toEqual(freshSnapshot);
    });
  });

  describe('when version check fails (fetch error or non-ok response)', () => {
    it('skips inner load when version check fails and fallback TTL has not expired', async () => {
      const now = 10_000;
      const prevSnapshot: Snap = { value: 7 };
      const inner = makeInner();
      // Simulate a fetch error
      const fetchImpl = jest.fn(async () => { throw new Error('Network error'); });

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fallbackTtlMs: 60_000,
        fetchImpl: fetchImpl as any,
        clock: () => now,
      });

      const result = await loader.load(makeContext({
        previousSnapshot: prevSnapshot,
        metadata: { refreshedAt: now - 1_000 }, // fresh, TTL not expired
      }));

      expect(inner.load).not.toHaveBeenCalled();
      expect(result.snapshot).toBe(prevSnapshot);
    });

    it('calls inner load when version check fails and fallback TTL has expired', async () => {
      const now = 10_000;
      const prevSnapshot: Snap = { value: 7 };
      const freshSnapshot: Snap = { value: 99 };
      const inner = makeInner(freshSnapshot);
      const fetchImpl = jest.fn(async () => makeFailResponse());

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fallbackTtlMs: 5_000,
        fetchImpl: fetchImpl as any,
        clock: () => now,
      });

      const result = await loader.load(makeContext({
        previousSnapshot: prevSnapshot,
        metadata: { refreshedAt: now - 10_000 }, // older than fallbackTtlMs
      }));

      expect(inner.load).toHaveBeenCalledTimes(1);
      expect(result.snapshot).toEqual(freshSnapshot);
    });

    it('calls inner load when version check fails and no fallbackTtlMs is configured', async () => {
      const prevSnapshot: Snap = { value: 7 };
      const freshSnapshot: Snap = { value: 55 };
      const inner = makeInner(freshSnapshot);
      const fetchImpl = jest.fn(async () => { throw new Error('Timeout'); });

      // No fallbackTtlMs provided
      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const result = await loader.load(makeContext({
        previousSnapshot: prevSnapshot,
        metadata: { refreshedAt: 0 },
      }));

      expect(inner.load).toHaveBeenCalledTimes(1);
      expect(result.snapshot).toEqual(freshSnapshot);
    });
  });

  describe('progress reporting', () => {
    it('sends -1 progress during the version check (indeterminate phase)', async () => {
      const inner = makeInner({ value: 1 });
      const fetchImpl = jest.fn(async () => makeVersionResponse('v99'));

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const progressValues: number[] = [];
      await loader.load(makeContext({
        onProgress: (p) => progressValues.push(p),
      }));

      expect(progressValues[0]).toBe(-1);
    });

    it('sends progress 100 when skipping inner load because hash matches', async () => {
      const inner = makeInner();
      const fetchImpl = jest.fn(async () => makeVersionResponse('v1.0'));

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const progressValues: number[] = [];
      await loader.load(makeContext({
        previousSnapshot: { value: 1 },
        metadata: { refreshedAt: 0, hash: 'v1.0' },
        onProgress: (p) => progressValues.push(p),
      }));

      expect(progressValues).toContain(100);
    });
  });

  describe('metadata merging', () => {
    it('merges the resolved hash into result metadata', async () => {
      const inner: LoaderStrategy<Snap, Meta> = {
        load: jest.fn(async () => ({
          snapshot: { value: 1 },
          metadata: { refreshedAt: 0, hash: 'inner-hash' },
        })),
      };
      const fetchImpl = jest.fn(async () => makeVersionResponse('remote-v2'));

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const result = await loader.load(makeContext());

      // The remote version should take precedence over what inner returned
      expect(result.metadata?.hash).toBe('remote-v2');
    });

    it('preserves inner hash in metadata when version fetch fails', async () => {
      const inner: LoaderStrategy<Snap, Meta> = {
        load: jest.fn(async () => ({
          snapshot: { value: 1 },
          metadata: { refreshedAt: 0, hash: 'inner-v1' },
        })),
      };
      const fetchImpl = jest.fn(async () => { throw new Error('Network down'); });

      const loader = new VersionCheckingLoader({
        inner,
        versionUrl: 'https://api.example.com/version',
        extractVersion: (r: any) => r.tag_name,
        fetchImpl: fetchImpl as any,
      });

      const result = await loader.load(makeContext());

      // latestVersion is undefined so hash comes from inner metadata
      expect(result.metadata?.hash).toBe('inner-v1');
    });
  });
});

describe('extractGitHubReleaseTag', () => {
  it('extracts tag_name from a valid GitHub release response', () => {
    const response = { tag_name: 'v1.2.3', name: 'Release 1.2.3' };
    expect(extractGitHubReleaseTag(response)).toBe('v1.2.3');
  });

  it('converts non-string tag_name to string', () => {
    const response = { tag_name: 42 };
    expect(extractGitHubReleaseTag(response)).toBe('42');
  });

  it('throws on null response', () => {
    expect(() => extractGitHubReleaseTag(null)).toThrow('Invalid GitHub release response');
  });

  it('throws on response without tag_name property', () => {
    expect(() => extractGitHubReleaseTag({ name: 'no tag' })).toThrow('Invalid GitHub release response');
  });

  it('throws on primitive response', () => {
    expect(() => extractGitHubReleaseTag('not an object')).toThrow('Invalid GitHub release response');
  });
});

describe('GITHUB_RELEASES_LATEST_URL', () => {
  it('formats the URL correctly for the given owner and repo', () => {
    const url = GITHUB_RELEASES_LATEST_URL('my-owner', 'my-repo');
    expect(url).toBe('https://api.github.com/repos/my-owner/my-repo/releases/latest');
  });

  it('handles owner and repo with hyphens and dots', () => {
    const url = GITHUB_RELEASES_LATEST_URL('org-name', 'repo.name');
    expect(url).toBe('https://api.github.com/repos/org-name/repo.name/releases/latest');
  });
});
