/**
 * Plugin Location Notes Registry - Manages location notes contributed by plugins.
 *
 * Plugins can add notes to locations that appear alongside user notes.
 * Plugin notes are read-only for users and displayed with the plugin name.
 */

import eventBus from "./eventBus";

interface StoredNote {
  note: string;
  pluginName: string;
}

export interface PluginLocationNote {
  pluginId: string;
  pluginName: string;
  roomId: number;
  note: string;
}

// Map of roomId -> Map of pluginId -> StoredNote
const pluginNotes = new Map<number, Map<string, StoredNote>>();

/**
 * Set a plugin note for a location
 * @param pluginId - Unique plugin identifier
 * @param pluginName - Display name of the plugin
 * @param roomId - Room ID to add note to
 * @param note - Note content (empty string to remove)
 */
export function setPluginLocationNote(
  pluginId: string,
  pluginName: string,
  roomId: number,
  note: string
): void {
  if (!note || note.trim() === '') {
    removePluginLocationNote(pluginId, roomId);
    return;
  }

  let roomNotes = pluginNotes.get(roomId);
  if (!roomNotes) {
    roomNotes = new Map();
    pluginNotes.set(roomId, roomNotes);
  }

  roomNotes.set(pluginId, { note: note.trim(), pluginName });
  eventBus.emit('pluginLocationNote.changed', { roomId, pluginId });
}

/**
 * Remove a plugin note for a location
 * @param pluginId - Plugin identifier
 * @param roomId - Room ID to remove note from
 */
export function removePluginLocationNote(pluginId: string, roomId: number): void {
  const roomNotes = pluginNotes.get(roomId);
  if (!roomNotes) return;

  if (roomNotes.has(pluginId)) {
    roomNotes.delete(pluginId);
    if (roomNotes.size === 0) {
      pluginNotes.delete(roomId);
    }
    eventBus.emit('pluginLocationNote.changed', { roomId, pluginId });
  }
}

/**
 * Remove all notes from a plugin (for cleanup on plugin unload)
 * @param pluginId - Plugin identifier
 */
export function removeAllPluginNotes(pluginId: string): void {
  const affectedRooms: number[] = [];

  for (const [roomId, roomNotes] of pluginNotes) {
    if (roomNotes.has(pluginId)) {
      roomNotes.delete(pluginId);
      affectedRooms.push(roomId);
      if (roomNotes.size === 0) {
        pluginNotes.delete(roomId);
      }
    }
  }

  for (const roomId of affectedRooms) {
    eventBus.emit('pluginLocationNote.changed', { roomId, pluginId });
  }
}

/**
 * Get all plugin notes for a location
 * @param roomId - Room ID to get notes for
 * @returns Array of plugin notes for the location
 */
export function getPluginLocationNotes(roomId: number): PluginLocationNote[] {
  const roomNotes = pluginNotes.get(roomId);
  if (!roomNotes) return [];

  const result: PluginLocationNote[] = [];
  for (const [pluginId, stored] of roomNotes) {
    result.push({ pluginId, pluginName: stored.pluginName, roomId, note: stored.note });
  }
  return result;
}

/**
 * Check if any plugin notes exist for a location
 * @param roomId - Room ID to check
 * @returns true if any plugin notes exist
 */
export function hasPluginLocationNotes(roomId: number): boolean {
  const roomNotes = pluginNotes.get(roomId);
  return roomNotes !== undefined && roomNotes.size > 0;
}

/**
 * Update the plugin name for all notes from a plugin
 * Called when the plugin name becomes available after init
 * @param pluginId - Plugin identifier
 * @param pluginName - New display name
 */
export function updatePluginNotesName(pluginId: string, pluginName: string): void {
  for (const [roomId, roomNotes] of pluginNotes) {
    const stored = roomNotes.get(pluginId);
    if (stored) {
      stored.pluginName = pluginName;
      eventBus.emit('pluginLocationNote.changed', { roomId, pluginId });
    }
  }
}
