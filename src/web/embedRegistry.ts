import type { EmbeddedMap } from "./embed";

/**
 * The live map instance is a single app-wide singleton, created asynchronously
 * once map data has loaded. Historically every consumer reached for
 * `(globalThis as any).embedded`, scattering untyped casts across the UI.
 *
 * This module is the one typed door to it:
 * - `getEmbeddedMap()` / `setEmbeddedMap()` are fully typed; the cast lives here
 *   and nowhere else.
 * - It stays backed by `globalThis` (rather than a module local) because two
 *   consumers can only reach it through the global: the DOM-free client scripts
 *   (which must not import `@web`) and the e2e harness (which pokes
 *   `window.embedded`). Keeping the same backing store means those keep working
 *   unchanged.
 * - `subscribeEmbeddedMap()` lets components react to the map arriving instead of
 *   polling `globalThis` on a timer.
 */

interface EmbeddedHost {
    embedded?: EmbeddedMap | null;
}

const host = globalThis as unknown as EmbeddedHost;
const listeners = new Set<(map: EmbeddedMap | null) => void>();

/** The current map instance, or null before it has loaded. */
export function getEmbeddedMap(): EmbeddedMap | null {
    return host.embedded ?? null;
}

/** Publish the current map instance (or null to clear) and notify subscribers. */
export function setEmbeddedMap(map: EmbeddedMap | null): void {
    host.embedded = map;
    listeners.forEach(listener => listener(map));
}

/**
 * Subscribe to the map instance. The listener is invoked immediately with the
 * current value and again whenever it changes. Returns an unsubscribe function.
 */
export function subscribeEmbeddedMap(
    listener: (map: EmbeddedMap | null) => void,
): () => void {
    listeners.add(listener);
    listener(getEmbeddedMap());
    return () => {
        listeners.delete(listener);
    };
}
