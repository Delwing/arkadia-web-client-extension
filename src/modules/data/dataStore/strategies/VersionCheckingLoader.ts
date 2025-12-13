import { LoaderContext, LoaderResult, LoaderStrategy, RefreshMetadata } from '../types';

export interface VersionCheckingLoaderOptions<TSnapshot, TMeta extends RefreshMetadata> {
  inner: LoaderStrategy<TSnapshot, TMeta>;
  versionUrl: string;
  extractVersion: (response: unknown) => string;
  fallbackTtlMs?: number;
  fetchImpl?: typeof fetch;
  clock?: () => number;
}

export class VersionCheckingLoader<TSnapshot, TMeta extends RefreshMetadata = RefreshMetadata>
  implements LoaderStrategy<TSnapshot, TMeta>
{
  private readonly inner: LoaderStrategy<TSnapshot, TMeta>;
  private readonly versionUrl: string;
  private readonly extractVersion: (response: unknown) => string;
  private readonly fallbackTtlMs?: number;
  private readonly fetchImpl: typeof fetch;
  private readonly clock: () => number;

  constructor(options: VersionCheckingLoaderOptions<TSnapshot, TMeta>) {
    this.inner = options.inner;
    this.versionUrl = options.versionUrl;
    this.extractVersion = options.extractVersion;
    this.fallbackTtlMs = options.fallbackTtlMs;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.clock = options.clock ?? (() => Date.now());
  }

  async load(context: LoaderContext<TSnapshot, TMeta>): Promise<LoaderResult<TSnapshot, TMeta>> {
    const latestVersion = await this.fetchLatestVersion();

    // Version check succeeded - use version-based comparison
    if (latestVersion != null) {
      if (
        context.previousSnapshot &&
        context.metadata?.hash === latestVersion &&
        !context.force
      ) {
        context.onProgress?.(100);
        return {
          snapshot: context.previousSnapshot,
          metadata: { hash: latestVersion } as Partial<TMeta>,
        };
      }
    } else {
      // Version check failed - fall back to TTL if we have cached data
      if (context.previousSnapshot && !context.force && !this.isTtlExpired(context.metadata)) {
        context.onProgress?.(100);
        return {
          snapshot: context.previousSnapshot,
        };
      }
    }

    const result = await this.inner.load(context);

    return {
      ...result,
      metadata: {
        ...result.metadata,
        hash: latestVersion ?? result.metadata?.hash,
      } as Partial<TMeta>,
    };
  }

  private isTtlExpired(metadata?: TMeta): boolean {
    if (this.fallbackTtlMs == null || metadata?.refreshedAt == null) {
      return true;
    }
    const age = this.clock() - metadata.refreshedAt;
    return age >= this.fallbackTtlMs;
  }

  private async fetchLatestVersion(): Promise<string | undefined> {
    try {
      const response = await this.fetchImpl(this.versionUrl);
      if (!response.ok) {
        return undefined;
      }
      const data = await response.json();
      return this.extractVersion(data);
    } catch {
      return undefined;
    }
  }
}

export const GITHUB_RELEASES_LATEST_URL = (owner: string, repo: string) =>
  `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

export const extractGitHubReleaseTag = (response: unknown): string => {
  if (typeof response === 'object' && response !== null && 'tag_name' in response) {
    return String((response as { tag_name: unknown }).tag_name);
  }
  throw new Error('Invalid GitHub release response');
};
