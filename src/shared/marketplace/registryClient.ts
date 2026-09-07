/**
 * Read-only client for the plugin registry (arkadia-plugin-marketplace).
 *
 * The registry is a separate deployment; every endpoint used here is public and
 * CORS-open, so the client talks to it directly with no account of its own. The
 * publishing side of the same registry is reached from the plugin editor via
 * the window handoff in `./registryHandoff.ts` — nothing here needs a token.
 *
 * Installing a catalogue plugin is deliberately *not* a new storage concept: it
 * appends the registry's immutable bundle URL to the existing `scripts` list,
 * exactly like a hand-typed URL. Which catalogue entry an installed script
 * belongs to is then read back out of the URL (`parseRegistryBundleUrl`), so
 * there is no second source of truth to keep in sync and an install made by an
 * older client (via `?add-script=`) is recognised just the same.
 */
import { REGISTRY_URL } from './registryHandoff.ts'

/** Mirrors `PluginSummary` in the registry's `lib/types.ts`. */
export interface RegistryPluginSummary {
    slug: string
    displayName: string
    description: string
    tags: string[]
    latestVersion: string | null
    installs: number
    owner: { handle: string; displayName: string } | null
    repositoryUrl?: string
    deprecated?: string
    updatedAt: string
    trustedPublisher: boolean
}

export interface RegistryVersion {
    version: string
    size: number
    sha256: string
    publishedAt: string
    changelog?: string
    yanked: boolean
    hasSources: boolean
}

export interface RegistryPluginDetail {
    plugin: RegistryPluginSummary
    readme: string
    homepageUrl?: string
    license?: string
    createdAt: string
    versions: RegistryVersion[]
    install: {
        bundleUrl: string
        latestUrl: string
        packageUrl: string
        clientUrl: string
    } | null
}

export interface RegistrySearchResult {
    items: RegistryPluginSummary[]
    total: number
    page: number
    perPage: number
}

export type RegistrySort = 'popular' | 'recent' | 'name'

export interface RegistrySearchOptions {
    query?: string
    tag?: string
    sort?: RegistrySort
    page?: number
    perPage?: number
    signal?: AbortSignal
}

/** `/r/<slug>/<version>/plugin.js` — the only URL shape the registry serves bundles at. */
const BUNDLE_PATH = /^\/r\/([^/]+)\/([^/]+)\/plugin\.js$/

export function registryBundleUrl(slug: string, version: string, registryUrl: string = REGISTRY_URL): string {
    return `${registryUrl}/r/${encodeURIComponent(slug)}/${encodeURIComponent(version)}/plugin.js`
}

/** The catalogue page for a plugin, for "open in the registry". */
export function registryPageUrl(slug: string, registryUrl: string = REGISTRY_URL): string {
    return `${registryUrl}/plugins/${encodeURIComponent(slug)}`
}

function originOf(url: string): string | null {
    try {
        return new URL(url).origin
    } catch {
        return null
    }
}

/**
 * Recognise an installed script as a catalogue entry.
 *
 * Only URLs on the registry's own origin count — a look-alike path on someone
 * else's host must not inherit a catalogue identity (and with it the update
 * check that would replace it with registry code).
 */
export function parseRegistryBundleUrl(
    url: string,
    registryUrl: string = REGISTRY_URL,
): { slug: string; version: string } | null {
    const registry = originOf(registryUrl)
    if (!registry) return null

    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return null
    }
    if (parsed.origin !== registry) return null

    const match = BUNDLE_PATH.exec(parsed.pathname)
    if (!match) return null

    return { slug: decodeURIComponent(match[1]), version: decodeURIComponent(match[2]) }
}

/**
 * Compare two versions the way the registry orders releases: numeric segments
 * first, then a prerelease suffix, where a release outranks any prerelease of
 * the same numbers (`1.2.0` > `1.2.0-rc.1`).
 *
 * Returns a negative number when `a` is older, positive when newer, 0 when they
 * are the same. Non-numeric junk sorts as 0, so a nonsense version never claims
 * to be an upgrade.
 */
export function compareVersions(a: string, b: string): number {
    const [aCore, aPre] = splitVersion(a)
    const [bCore, bPre] = splitVersion(b)

    for (let i = 0; i < Math.max(aCore.length, bCore.length); i++) {
        const diff = (aCore[i] ?? 0) - (bCore[i] ?? 0)
        if (diff !== 0) return diff < 0 ? -1 : 1
    }

    if (aPre === bPre) return 0
    if (!aPre) return 1
    if (!bPre) return -1
    return aPre < bPre ? -1 : 1
}

function splitVersion(version: string): [number[], string] {
    const trimmed = String(version ?? '').trim().replace(/^v/i, '')
    const [core, ...rest] = trimmed.split('-')
    const numbers = core.split('.').map((part) => {
        const value = Number.parseInt(part, 10)
        return Number.isFinite(value) ? value : 0
    })
    return [numbers, rest.join('-')]
}

/** True when the catalogue has something newer than what is installed. */
export function isUpdateAvailable(installed: string, latest: string | null | undefined): boolean {
    if (!latest || !installed) return false
    // A "latest" pin already follows the newest release; nothing to offer.
    if (installed === 'latest') return false
    return compareVersions(latest, installed) > 0
}

class RegistryError extends Error {
    constructor(message: string, readonly status?: number) {
        super(message)
        this.name = 'RegistryError'
    }
}

async function getJson<T>(path: string, signal?: AbortSignal, registryUrl: string = REGISTRY_URL): Promise<T> {
    let response: Response
    try {
        response = await fetch(`${registryUrl}${path}`, { signal, headers: { Accept: 'application/json' } })
    } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error
        throw new RegistryError('Nie udalo sie polaczyc z katalogiem pluginow')
    }

    if (!response.ok) {
        const message = await response
            .json()
            .then((body: { error?: string }) => body?.error)
            .catch(() => undefined)
        throw new RegistryError(message || `Katalog odpowiedzial bledem ${response.status}`, response.status)
    }

    return (await response.json()) as T
}

export async function searchRegistry(
    options: RegistrySearchOptions = {},
    registryUrl: string = REGISTRY_URL,
): Promise<RegistrySearchResult> {
    const params = new URLSearchParams()
    if (options.query?.trim()) params.set('q', options.query.trim())
    if (options.tag) params.set('tag', options.tag)
    if (options.sort) params.set('sort', options.sort)
    if (options.page && options.page > 1) params.set('page', String(options.page))
    if (options.perPage) params.set('perPage', String(options.perPage))

    const query = params.toString()
    return getJson<RegistrySearchResult>(`/api/v1/plugins${query ? `?${query}` : ''}`, options.signal, registryUrl)
}

export async function fetchRegistryPlugin(
    slug: string,
    signal?: AbortSignal,
    registryUrl: string = REGISTRY_URL,
): Promise<RegistryPluginDetail> {
    return getJson<RegistryPluginDetail>(`/api/v1/plugins/${encodeURIComponent(slug)}`, signal, registryUrl)
}

/**
 * Look up a whole installed list in one request — this is what the update badge
 * on the "Zainstalowane" tab is built from. Returns an empty map for an empty
 * input rather than calling the API with nothing to ask about.
 */
export async function fetchRegistrySummaries(
    slugs: string[],
    signal?: AbortSignal,
    registryUrl: string = REGISTRY_URL,
): Promise<Map<string, RegistryPluginSummary>> {
    const wanted = [...new Set(slugs.filter(Boolean))].slice(0, 100)
    if (wanted.length === 0) return new Map()

    const result = await getJson<{ items: RegistryPluginSummary[] }>(
        `/api/v1/plugins?slugs=${encodeURIComponent(wanted.join(','))}`,
        signal,
        registryUrl,
    )
    return new Map(result.items.map((item) => [item.slug, item]))
}

/**
 * Bump the install counter. Bundles are served from an immutable cache, so the
 * registry cannot count them from its own traffic — but a failed count is never
 * worth failing an install over, so this swallows everything.
 */
export function reportRegistryInstall(slug: string, registryUrl: string = REGISTRY_URL): void {
    void fetch(`${registryUrl}/api/v1/plugins/${encodeURIComponent(slug)}/install`, {
        method: 'POST',
        keepalive: true,
    }).catch(() => undefined)
}
