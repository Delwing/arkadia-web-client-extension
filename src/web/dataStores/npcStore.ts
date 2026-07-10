/**
 * NPC store — re-export shim.
 *
 * The implementation moved to `@modules/data/npcStore` (UI-neutral shared data
 * layer) so the client can record NPC locations without a `@client → @web`
 * import. This shim preserves the historical `@web/dataStores/npcStore` path.
 */
export * from '@modules/data/npcStore';
