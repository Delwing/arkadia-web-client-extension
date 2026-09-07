import { useCallback, useEffect, useMemo, useState } from "react";
import { globalStorage } from "@modules/core/storage";
import { getPluginManager } from "@client/main";
import type { PluginInfo, PluginStatus } from "@shared/types/Plugin";
import {
    deletePluginScript,
    getAllStoredPluginIds,
    getAllStoredPlugins,
} from "@client/utils/pluginStorage";
import { deleteEditorPlugin } from "@client/utils/pluginEditorStorage";
import {
    fetchRegistrySummaries,
    isUpdateAvailable,
    parseRegistryBundleUrl,
    registryBundleUrl,
    reportRegistryInstall,
    type RegistryPluginSummary,
} from "@shared/marketplace/registryClient.ts";

/**
 * Where an installed plugin came from. This is derived, never stored: a
 * catalogue install is just a URL on the registry's origin (see
 * `parseRegistryBundleUrl`), so plugins installed by an older client — or by
 * the `?add-script=` deep link the registry's website hands out — light up as
 * catalogue entries here too, with working update checks.
 */
export type PluginSource = "registry" | "url" | "local";

export interface InstalledPlugin {
    /** The identifier as it appears in storage: a URL, or an IndexedDB plugin id. */
    id: string;
    source: PluginSource;
    name: string;
    version?: string;
    author?: string;
    description?: string;
    status: PluginStatus | "unknown";
    error?: string;
    /** Catalogue slug and the pinned version, for `source === "registry"`. */
    slug?: string;
    installedVersion?: string;
    /** Set when the catalogue has a newer release than the pinned one. */
    updateVersion?: string;
    /** Secondary line: the URL, or the stored id. */
    detail: string;
}

const SCRIPTS_KEY = "scripts";
const STORED_SCRIPTS_KEY = "stored_scripts";

interface StoredMeta {
    name?: string;
    version?: string;
    author?: string;
    description?: string;
}

/**
 * A copy of what the PluginManager currently knows about one plugin.
 *
 * It must be a copy: the manager mutates its own `LoadedPlugin` objects in
 * place, so holding the references would make every state snapshot compare
 * equal to the next one and no render would ever see a status change.
 */
interface RuntimeState {
    status: PluginStatus;
    error?: string;
    info?: PluginInfo;
}

function sameRuntime(a: Map<string, RuntimeState>, b: Map<string, RuntimeState>): boolean {
    if (a.size !== b.size) return false;
    for (const [id, next] of b) {
        const previous = a.get(id);
        if (!previous) return false;
        if (previous.status !== next.status || previous.error !== next.error) return false;
        if (previous.info?.name !== next.info?.name || previous.info?.version !== next.info?.version) return false;
    }
    return true;
}

/**
 * Everything the Skrypty panel knows about what is installed: the two storage
 * lists (URL scripts in localStorage, packaged plugins in IndexedDB), the live
 * load status from the PluginManager, and the catalogue's latest versions.
 */
export function useInstalledPlugins() {
    const [urls, setUrls] = useState<string[]>([]);
    const [storedIds, setStoredIds] = useState<string[]>([]);
    const [storedMeta, setStoredMeta] = useState<Map<string, StoredMeta>>(new Map());
    const [loaded, setLoaded] = useState<Map<string, RuntimeState>>(new Map());
    const [catalog, setCatalog] = useState<Map<string, RegistryPluginSummary>>(new Map());
    const [catalogError, setCatalogError] = useState<string | null>(null);

    // False until the client's PluginManager exists; the panel can be opened
    // before the client has finished booting.
    const [managerReady, setManagerReady] = useState(false);

    const refreshLoaded = useCallback(() => {
        const manager = getPluginManager();
        if (!manager) return;
        setManagerReady(true);
        const next = new Map(
            manager.getLoadedPlugins().map((plugin) => [
                plugin.url,
                { status: plugin.status, error: plugin.error, info: plugin.info } satisfies RuntimeState,
            ])
        );
        // Keeping the old map when nothing moved stops the poll below from
        // restarting itself on every tick.
        setLoaded((previous) => (sameRuntime(previous, next) ? previous : next));
    }, []);

    const refreshStored = useCallback(async () => {
        try {
            const plugins = await getAllStoredPlugins();
            setStoredIds(plugins.map((plugin) => plugin.id));
            setStoredMeta(
                new Map(
                    plugins
                        .filter((plugin) => plugin.metadata)
                        .map((plugin) => [plugin.id, plugin.metadata as StoredMeta])
                )
            );
        } catch (error) {
            console.error("Failed to load stored plugins from IndexedDB:", error);
        }
    }, []);

    useEffect(() => {
        const saved = globalStorage.get(SCRIPTS_KEY);
        setUrls(Array.isArray(saved) ? saved : []);
        void refreshStored();
        refreshLoaded();

        const client = window.client;
        if (!client) return;
        const onChange = () => refreshLoaded();
        client.on("plugin:loaded", onChange);
        client.on("plugin:error", onChange);
        client.on("plugin:destroyed", onChange);
        return () => {
            client.off("plugin:loaded", onChange);
            client.off("plugin:error", onChange);
            client.off("plugin:destroyed", onChange);
        };
    }, [refreshLoaded, refreshStored]);

    // The PluginManager emits only for the `loaded` and `error` outcomes: a URL
    // that turns out to be a plain old script settles as `legacy` in silence, and
    // without this would sit under a spinner for the rest of the session. Poll
    // while anything is still in flight, and stop the moment everything settled.
    useEffect(() => {
        const pending = !managerReady || [...loaded.values()].some((runtime) => runtime.status === "loading");
        if (!pending) return;
        const timer = setInterval(refreshLoaded, 400);
        return () => clearInterval(timer);
    }, [loaded, managerReady, refreshLoaded]);

    const saveUrls = useCallback((next: string[]) => {
        setUrls(next);
        globalStorage.set(SCRIPTS_KEY, next);
    }, []);

    /** Slugs of everything installed from the catalogue, with the pinned version. */
    const installedSlugs = useMemo(() => {
        const map = new Map<string, string>();
        for (const url of urls) {
            const parsed = parseRegistryBundleUrl(url);
            if (parsed) map.set(parsed.slug, parsed.version);
        }
        return map;
    }, [urls]);

    // One batched lookup for the whole installed list, re-run whenever the set
    // of installed slugs changes (an install, an update or a removal).
    const slugKey = useMemo(() => [...installedSlugs.keys()].sort().join(","), [installedSlugs]);

    useEffect(() => {
        const slugs = slugKey ? slugKey.split(",") : [];
        if (slugs.length === 0) {
            setCatalog(new Map());
            setCatalogError(null);
            return;
        }

        const controller = new AbortController();
        fetchRegistrySummaries(slugs, controller.signal)
            .then((summaries) => {
                setCatalog(summaries);
                setCatalogError(null);
            })
            .catch((error: Error) => {
                if (error?.name === "AbortError") return;
                // Not fatal: the list still works, it just cannot offer updates.
                setCatalogError(error.message);
            });
        return () => controller.abort();
    }, [slugKey]);

    const plugins = useMemo<InstalledPlugin[]>(() => {
        const fromUrls = urls.map((url) => {
            const runtime = loaded.get(url);
            const registry = parseRegistryBundleUrl(url);
            const summary = registry ? catalog.get(registry.slug) : undefined;
            const update =
                registry && isUpdateAvailable(registry.version, summary?.latestVersion)
                    ? (summary?.latestVersion ?? undefined)
                    : undefined;

            return {
                id: url,
                source: registry ? ("registry" as const) : ("url" as const),
                name: runtime?.info?.name ?? summary?.displayName ?? registry?.slug ?? url,
                version: runtime?.info?.version ?? registry?.version,
                author: runtime?.info?.author ?? (summary?.owner ? `@${summary.owner.handle}` : undefined),
                description: runtime?.info?.description ?? summary?.description,
                status: runtime?.status ?? "unknown",
                error: runtime?.error,
                slug: registry?.slug,
                installedVersion: registry?.version,
                updateVersion: update,
                detail: registry ? `${registry.slug} · ${registry.version}` : url,
            } satisfies InstalledPlugin;
        });

        const fromStorage = storedIds.map((id) => {
            const runtime = loaded.get(id);
            const meta = storedMeta.get(id);
            return {
                id,
                source: "local" as const,
                name: runtime?.info?.name ?? meta?.name ?? "Plugin lokalny",
                version: runtime?.info?.version ?? meta?.version,
                author: runtime?.info?.author ?? meta?.author,
                description: runtime?.info?.description ?? meta?.description,
                status: runtime?.status ?? "unknown",
                error: runtime?.error,
                detail: id,
            } satisfies InstalledPlugin;
        });

        return [...fromUrls, ...fromStorage];
    }, [urls, storedIds, storedMeta, loaded, catalog]);

    /** Add a plain URL typed by the user. Ignores duplicates. */
    const addUrl = useCallback(
        (url: string) => {
            const trimmed = url.trim();
            if (!trimmed || urls.includes(trimmed)) return;
            saveUrls([...urls, trimmed]);
        },
        [urls, saveUrls]
    );

    /**
     * Install a catalogue release. Pinned, not `latest`: the pinned URL is
     * immutably cached, and an explicit "Aktualizuj" beats a plugin silently
     * changing under the player mid-session.
     */
    const installFromRegistry = useCallback(
        (slug: string, version: string) => {
            const url = registryBundleUrl(slug, version);
            // A different version of the same plugin is replaced, not stacked:
            // two copies of one plugin would both register their triggers.
            const next = urls.filter((entry) => parseRegistryBundleUrl(entry)?.slug !== slug);
            next.push(url);
            saveUrls(next);
            reportRegistryInstall(slug);
        },
        [urls, saveUrls]
    );

    /**
     * Remove a catalogue plugin by slug rather than by stored id, so the
     * catalogue tab can uninstall without knowing which version is pinned.
     */
    const uninstallFromRegistry = useCallback(
        (slug: string) => {
            saveUrls(urls.filter((entry) => parseRegistryBundleUrl(entry)?.slug !== slug));
        },
        [urls, saveUrls]
    );

    /** Swap a pinned catalogue URL for a newer one, keeping its place in the list. */
    const updateFromRegistry = useCallback(
        (slug: string, version: string) => {
            const url = registryBundleUrl(slug, version);
            saveUrls(
                urls.map((entry) => (parseRegistryBundleUrl(entry)?.slug === slug ? url : entry))
            );
            reportRegistryInstall(slug);
        },
        [urls, saveUrls]
    );

    const remove = useCallback(
        async (id: string) => {
            if (!storedIds.includes(id)) {
                saveUrls(urls.filter((entry) => entry !== id));
                return;
            }
            try {
                await deletePluginScript(id);
                // Drop the editor record too, or the deleted plugin keeps showing
                // up in the editor's plugin list.
                await deleteEditorPlugin(id);
                await refreshStored();
                globalStorage.set(STORED_SCRIPTS_KEY, await getAllStoredPluginIds());
            } catch (error) {
                console.error("Failed to delete plugin from IndexedDB:", error);
            }
        },
        [storedIds, urls, saveUrls, refreshStored]
    );

    /** Called after a plugin is written straight to IndexedDB (paste, ZIP import). */
    const reloadStored = useCallback(async () => {
        await refreshStored();
        globalStorage.set(STORED_SCRIPTS_KEY, await getAllStoredPluginIds());
    }, [refreshStored]);

    return {
        plugins,
        installedSlugs,
        catalogError,
        addUrl,
        installFromRegistry,
        updateFromRegistry,
        uninstallFromRegistry,
        remove,
        reloadStored,
    };
}
