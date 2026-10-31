import {
  setPluginLocationNote,
  removePluginLocationNote,
  removeAllPluginNotes,
  getPluginLocationNotes,
  updatePluginNotesName,
  type PluginLocationNote,
} from "@modules/core/pluginLocationNotesRegistry";
import type { PluginApiContext } from "./context";

/**
 * Location Notes API - Add plugin-contributed notes to locations
 *
 * Plugins can add notes to locations that appear alongside user notes.
 * Plugin notes are read-only for users and displayed with the plugin name.
 */
export interface LocationNotesApi {
  /**
   * Set a note for a location
   *
   * Setting an empty note removes it.
   *
   * @param roomId - Room ID to add note to
   * @param note - Note content (empty string to remove)
   *
   * @example
   * ```typescript
   * // Add a note to room 12345
   * api.locationNotes.set(12345, "Quest NPC here");
   *
   * // Remove the note
   * api.locationNotes.set(12345, "");
   * ```
   */
  set(roomId: number, note: string): void;

  /**
   * Remove a note for a location
   *
   * @param roomId - Room ID to remove note from
   *
   * @example
   * ```typescript
   * api.locationNotes.remove(12345);
   * ```
   */
  remove(roomId: number): void;

  /**
   * Get all plugin notes for a location (from all plugins)
   *
   * @param roomId - Room ID to get notes for
   * @returns Array of plugin notes for the location
   *
   * @example
   * ```typescript
   * const notes = api.locationNotes.get(12345);
   * notes.forEach(n => console.log(`${n.pluginId}: ${n.note}`));
   * ```
   */
  get(roomId: number): PluginLocationNote[];
}

export function createLocationNotesApi(ctx: PluginApiContext): LocationNotesApi {
  ctx.onCleanup(() => removeAllPluginNotes(ctx.pluginId));
  // Notes registered during init(), before the name was known
  ctx.onRename((name) => updatePluginNotesName(ctx.pluginId, name));
  return {
    set: (roomId: number, note: string): void => {
      setPluginLocationNote(ctx.pluginId, ctx.displayName, roomId, note);
    },

    remove: (roomId: number): void => {
      removePluginLocationNote(ctx.pluginId, roomId);
    },

    get: (roomId: number): PluginLocationNote[] => {
      return getPluginLocationNotes(roomId);
    }
  };
}
