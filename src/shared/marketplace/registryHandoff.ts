/**
 * Protocol for handing a plugin package from the editor to the plugin registry,
 * so the editor never needs a login of its own.
 *
 *   editor                          registry (/z-edytora)
 *     |  window.open(?origin=...) ----->  |
 *     |  <--------------- "ready" --------|
 *     |  postMessage(package) ---------->  |  sign in there, confirm, publish
 *     |  <------------ "published" -------|  slug, so the next release updates
 *
 * The registry owns the accounts, the form and the publishing; the editor only
 * hands over bytes and remembers the slug it gets back.
 */
export const HANDOFF_READY = 'arkadia-registry:ready'
export const HANDOFF_PACKAGE = 'arkadia-registry:package'
export const HANDOFF_PUBLISHED = 'arkadia-registry:published'

/** Placeholder `savePlugin` stamps onto every plugin; never worth sending. */
export const EDITOR_PLACEHOLDER_DESCRIPTION = 'Created with Plugin Editor'
export const EDITOR_PLACEHOLDER_AUTHOR = 'Plugin Editor'

export const REGISTRY_URL: string = (
    import.meta.env.VITE_MARKETPLACE_URL ?? 'https://arkadia-package-repository.vercel.app'
).replace(/\/+$/, '')

export interface HandoffPackageMessage {
    type: typeof HANDOFF_PACKAGE
    name?: string
    version?: string
    description?: string
    slug?: string
    zip: ArrayBuffer
}

export interface HandoffPublishedMessage {
    type: typeof HANDOFF_PUBLISHED
    slug: string
    version: string
    url: string
}

export type RegistryMessage =
    | { type: typeof HANDOFF_READY }
    | HandoffPublishedMessage

/** Where the popup should point, declaring who is handing the package over. */
export function handoffUrl(registryUrl: string = REGISTRY_URL, origin: string = location.origin): string {
    return `${registryUrl}/z-edytora?origin=${encodeURIComponent(origin)}`
}

/**
 * Accept a message only from the registry we opened, and only if it is one of
 * the two replies we expect. Everything else on the channel - extensions, dev
 * tooling, other frames - is ignored.
 */
export function readRegistryMessage(
    event: { origin: string; data: unknown },
    registryUrl: string = REGISTRY_URL,
): RegistryMessage | null {
    if (event.origin !== registryUrl) return null

    const data = event.data as
        | { type?: string; slug?: unknown; version?: unknown; url?: unknown }
        | null
        | undefined
    if (!data || typeof data !== 'object') return null

    if (data.type === HANDOFF_READY) return { type: HANDOFF_READY }

    if (
        data.type === HANDOFF_PUBLISHED &&
        typeof data.slug === 'string' &&
        typeof data.version === 'string' &&
        typeof data.url === 'string'
    ) {
        return { type: HANDOFF_PUBLISHED, slug: data.slug, version: data.version, url: data.url }
    }

    return null
}

/**
 * The metadata worth sending with a package.
 *
 * `savePlugin` rewrites plugin metadata on every save with a fixed
 * `version: '1.0.0'` and a placeholder description, so those values say nothing
 * about the plugin. They are dropped here and the registry falls back to the
 * PluginInfo the code itself returns from `init()`.
 */
export function handoffMetadata(plugin: {
    name: string
    metadata?: { name?: string; version?: string; description?: string }
    registrySlug?: string
}): { name?: string; version?: string; description?: string; slug?: string } {
    const description = plugin.metadata?.description
    const version = plugin.metadata?.version

    return {
        name: plugin.metadata?.name || plugin.name || undefined,
        version: version && version !== '1.0.0' ? version : undefined,
        description:
            description && description !== EDITOR_PLACEHOLDER_DESCRIPTION ? description : undefined,
        slug: plugin.registrySlug || undefined,
    }
}
