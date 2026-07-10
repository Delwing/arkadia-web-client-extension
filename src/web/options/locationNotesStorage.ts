/**
 * Location notes storage — re-export shim.
 *
 * The implementation moved to `@modules/data/locationNotesStorage` (UI-neutral
 * shared data layer) so the client can read location notes without a
 * `@client → @web` import. This shim preserves the historical
 * `@web/options/locationNotesStorage` path.
 */
export * from '@modules/data/locationNotesStorage';
