/**
 * The module plugins import the API types from, as in an IDE with the npm
 * package (`import type { PluginApi } from '@arkadia/plugin-types'`), so a
 * plugin reads the same in both. Auto-imports use it.
 */
export const PLUGIN_TYPES_MODULE = '@arkadia/plugin-types'
/** The name the editor offered before; it still resolves, and its imports are merged into. */
export const LEGACY_PLUGIN_TYPES_MODULE = 'plugin-api'
