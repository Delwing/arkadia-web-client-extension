/**
 * Lazy loader for the generated knowledge bundle.
 *
 * Loaded with `fetch` at panel-open time and **never** with a `?raw` import:
 * the fat bundle is ~200 kB of JSON, and inlining it at build time would fatten
 * the client chunk for every session, including the overwhelming majority that
 * never open the assistant. (`src/web/options/Scripts.tsx` inlines
 * `PLUGINS.md?raw` + the plugin type declarations, which is why the Skrypty
 * chunk is ~40 kB gzip — the precedent to avoid, not to copy.)
 *
 * The only thing the Worker path needs from it is `version`, which it sends as
 * `kbVersion` so the Worker can tell a stale client from a current one. The
 * BYOK path additionally needs the lean projection, which is designed to be
 * sent as a standalone system prompt.
 */

import {
    KB_PUBLIC_PATH,
    projectLean,
    type KnowledgeBundle,
    type LeanKnowledgeBundle,
} from '@shared/assistant/knowledgeBundle.ts';

/**
 * Resolved against the Vite base, not used as an absolute path: the build sets
 * `base: "./"` and the site is served from a GitHub Pages subdirectory, where a
 * leading-slash URL would 404.
 */
function bundleUrl(): string {
    const base = import.meta.env.BASE_URL ?? '/';
    return `${base}${KB_PUBLIC_PATH.replace(/^\//, '')}`;
}

let cached: Promise<KnowledgeBundle> | null = null;

export function loadKnowledgeBundle(): Promise<KnowledgeBundle> {
    if (!cached) {
        cached = fetch(bundleUrl())
            .then(response => {
                if (!response.ok) throw new Error(`assistant-kb.json: HTTP ${response.status}`);
                return response.json() as Promise<KnowledgeBundle>;
            })
            .catch(err => {
                // Do not memoise a failure: a transient offline moment should not
                // disable the assistant for the rest of the session.
                cached = null;
                throw err;
            });
    }
    return cached;
}

/** Bundle version, or `'unknown'` when the bundle could not be fetched. */
export async function getKbVersion(): Promise<string> {
    try {
        return (await loadKnowledgeBundle()).version;
    } catch {
        return 'unknown';
    }
}

export async function loadLeanBundle(): Promise<LeanKnowledgeBundle> {
    return projectLean(await loadKnowledgeBundle());
}

/** Test seam: drop the memoised bundle. */
export function resetKnowledgeBundleCache(): void {
    cached = null;
}
