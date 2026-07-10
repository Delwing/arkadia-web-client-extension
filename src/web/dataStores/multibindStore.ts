/**
 * Multibind store — re-export shim.
 *
 * The implementation moved to `@modules/data/multibindStore` (UI-neutral shared
 * data layer) so the client can read/write multibinds without a
 * `@client → @web` import. This shim preserves the historical
 * `@web/dataStores/multibindStore` path.
 */
export * from '@modules/data/multibindStore';
