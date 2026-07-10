/**
 * Object List Entry Filter System — re-export shim.
 *
 * The implementation moved to `@modules/core/objectListFilters` (UI-neutral) so
 * the plugin API can register filters without a `@client → @web` import. This
 * shim preserves the historical `@web/objectListFilters` path referenced by
 * existing web code and by plugin-facing documentation.
 */
export * from '@modules/core/objectListFilters';
