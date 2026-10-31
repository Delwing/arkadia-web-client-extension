import type * as MapRenderer from "mudlet-map-renderer";
import type { ApplyChangesOptions, MapAreaData, RoomChange } from "@shared/map/MapHelper.ts";
import { registerRoomMenuEntry, unregisterRoomMenuEntry, updateRoomMenuEntry } from "@modules/core/pluginUiRegistry";
import { getMapOverlays, registerMapOverlay, unregisterMapOverlay } from "@modules/core/mapOverlayRegistry";
import { PluginMapOverlay } from "@client/pluginMapOverlay";
import type { PluginApiContext } from "./context";

/**
 * Options for creating a location highlighter
 */
export interface LocationHighlighterOptions {
  /** Highlight color (CSS color string). Defaults to "yellow" */
  color?: string;
  /** Whether the highlighter starts enabled. Defaults to true */
  enabled?: boolean;
}

/**
 * A location highlighter that can highlight rooms on the map.
 * Multiple highlighters can be active simultaneously with different colors.
 */
export interface LocationHighlighter {
  /**
   * Add room(s) to the highlight set
   * @param roomIds - Single room ID or array of room IDs to highlight
   *
   * @example
   * highlighter.add(12345);
   * highlighter.add([100, 200, 300]);
   */
  add(roomIds: number | number[]): void;

  /**
   * Remove room(s) from the highlight set
   * @param roomIds - Single room ID or array of room IDs to remove
   *
   * @example
   * highlighter.remove(12345);
   * highlighter.remove([100, 200]);
   */
  remove(roomIds: number | number[]): void;

  /**
   * Clear all rooms from the highlight set
   *
   * @example
   * highlighter.clear();
   */
  clear(): void;

  /**
   * Enable this highlighter (shows highlights on map)
   *
   * @example
   * highlighter.enable();
   */
  enable(): void;

  /**
   * Disable this highlighter (hides highlights without removing them)
   *
   * @example
   * highlighter.disable();
   */
  disable(): void;

  /**
   * Check if the highlighter is currently enabled
   * @returns true if enabled, false if disabled
   */
  isEnabled(): boolean;

  /**
   * Set the highlight color
   * @param color - CSS color string (e.g., "red", "#FF0000", "rgb(255,0,0)")
   *
   * @example
   * highlighter.setColor("#FF5500");
   * highlighter.setColor("cyan");
   */
  setColor(color: string): void;

  /**
   * Get the current highlight color
   * @returns The current CSS color string
   */
  getColor(): string;

  /**
   * Get all room IDs currently in the highlight set
   * @returns Array of room IDs
   */
  getRoomIds(): number[];

  /**
   * Destroy this highlighter and remove all its highlights from the map.
   * After calling destroy(), the highlighter should not be used.
   *
   * @example
   * highlighter.destroy();
   */
  destroy(): void;
}

/**
 * Drawing layer for map overlay shapes. "room" draws among the rooms,
 * "overlay" above them (default), "top" above everything including the
 * player marker.
 */
export type MapOverlayLayer = "room" | "overlay" | "top";

/**
 * Fill/stroke of a map overlay shape. Sizes are in map units (one grid step
 * is 1) unless the shape sets `noScale`.
 */
export interface MapOverlayPaint {
  /** Fill color (CSS color string) */
  fill?: string;
  /** Stroke color (CSS color string) */
  stroke?: string;
  /** Stroke width in map units */
  strokeWidth?: number;
  /** Dash pattern, e.g. [0.2, 0.1] */
  dash?: number[];
  /** Opacity 0..1 */
  alpha?: number;
}

/**
 * A shape drawn by a map overlay, in map coordinates.
 */
export type MapOverlayShape = (
  | { type: "circle"; cx: number; cy: number; radius: number; paint: MapOverlayPaint }
  | { type: "rect"; x: number; y: number; width: number; height: number; cornerRadius?: number; paint: MapOverlayPaint }
  | {
      type: "line";
      /** Flat list of [x0, y0, x1, y1, ...] */
      points: number[];
      paint: MapOverlayPaint;
      lineCap?: "butt" | "round" | "square";
      lineJoin?: "miter" | "round" | "bevel";
    }
  | {
      type: "polygon";
      /** Flat list of [x0, y0, x1, y1, ...] */
      vertices: number[];
      paint: MapOverlayPaint;
    }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      fontSize: number;
      fontFamily?: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      align?: "left" | "center" | "right";
      verticalAlign?: "top" | "middle" | "bottom";
    }
) & {
  /** Drawing layer, defaults to "overlay" */
  layer?: MapOverlayLayer;
  /** Keep a fixed on-screen size regardless of zoom */
  noScale?: boolean;
};

/**
 * What a map overlay sees when it renders.
 */
export interface MapOverlayRenderState {
  /** Room the player marker is on, if any */
  currentRoomId?: number;
  /** Area currently displayed on the map */
  areaId?: number;
  /** Z-level currently displayed on the map */
  z?: number;
  /**
   * The map renderer's live settings (user map appearance: `lineWidth`,
   * `roomSize`, `lineColor`, `roomShape`, ...). Sizes are in map units - use
   * them so the overlay matches the map. Read-only.
   */
  settings: Readonly<MapRenderer.Settings>;
  /** Look up a room of the loaded map */
  getRoom(roomId: number): MapData.Room | undefined;
}

/**
 * Definition of a custom map overlay, see {@link MapApi.addOverlay}.
 */
export interface MapOverlayDefinition {
  /**
   * Return the shapes to draw (or nothing). Shapes of rooms outside the
   * displayed area/z-level are the overlay's own responsibility to skip.
   */
  render(state: MapOverlayRenderState): MapOverlayShape | MapOverlayShape[] | void;
}

/**
 * Handle returned by {@link MapApi.addOverlay}.
 */
export interface MapOverlayHandle {
  /** Overlay id as passed to addOverlay */
  readonly id: string;
  /** Request a redraw, e.g. after the overlay's own data changed */
  invalidate(): void;
  /** Remove the overlay from the map */
  remove(): void;
}

/** @deprecated Use `MapData.Room` */
export type Room = MapData.Room;
/** @deprecated Use `MapData.direction` */
export type MapDirection = MapData.direction;
/** @deprecated Use `MapAreaData[]` */
export type MapExportData = MapAreaData[];

/**
 * Area information exposed via Map API
 */
export interface AreaInfo {
  /** Numeric area ID */
  areaId: number;
  /** Area display name */
  areaName: string;
  /** Array of rooms in this area */
  rooms: MapData.Room[];
}

/**
 * Map API - Access and modify map location
 */
export interface MapApi {
  /**
   * Get current room information
   * @returns Current room with full details or undefined if not in a room
   *
   * @example
   * const room = api.map.getRoom();
   * if (room) {
   *   console.log(`Current room: ${room.name} (${room.id})`);
   *   console.log(`Coordinates: ${room.x}, ${room.y}, ${room.z}`);
   *   console.log(`Area: ${room.areaId}`);
   * }
   */
  getRoom(): MapData.Room | undefined;

  /**
   * Get room information by ID
   * @param roomId - Room ID to look up
   * @returns Room with full details or null if not found
   *
   * @example
   * const room = api.map.getRoomById(12345);
   * if (room) {
   *   console.log(`Room: ${room.name} (${room.id})`);
   *   console.log(`Hash: ${room.hash}`);
   * }
   */
  getRoomById(roomId: number): MapData.Room | null;

  /**
   * Get all areas with their rooms
   * @returns Array of area information objects
   *
   * @example
   * const areas = api.map.getAreas();
   * areas.forEach(area => {
   *   console.log(`Area: ${area.areaName} (${area.areaId})`);
   *   console.log(`Rooms: ${area.rooms.length}`);
   * });
   */
  getAreas(): AreaInfo[];

  /**
   * Find shortest path between two rooms
   * @param fromId - Starting room ID
   * @param toId - Destination room ID
   * @returns Array of room IDs representing the path, or null if no path exists
   *
   * @example
   * const path = api.map.findPath(100, 200);
   * if (path) {
   *   console.log(`Path length: ${path.length - 1} steps`);
   *   console.log(`Route: ${path.join(" -> ")}`);
   * }
   */
  findPath(fromId: number, toId: number): number[] | null;

  /**
   * Set map location programmatically
   * @param roomId - Room ID to navigate to
   *
   * @example
   * api.map.setLocation(12345);
   */
  setLocation(roomId: number): void;

  /**
   * Step back to previous map location
   *
   * @example
   * api.map.stepBack();
   */
  stepBack(): void;

  /**
   * Create a location highlighter for highlighting rooms on the map.
   * Multiple highlighters can exist simultaneously with different colors.
   * Each highlighter can be enabled/disabled independently.
   *
   * @param options - Optional configuration for the highlighter
   * @returns A LocationHighlighter instance
   *
   * @example
   * // Create a red highlighter for quest locations
   * const questHighlighter = api.map.createHighlighter({ color: "red" });
   * questHighlighter.add([100, 200, 300]);
   *
   * // Create a blue highlighter for shops
   * const shopHighlighter = api.map.createHighlighter({ color: "blue" });
   * shopHighlighter.add([400, 500]);
   *
   * // Toggle visibility
   * questHighlighter.disable();
   * questHighlighter.enable();
   *
   * // Clean up when done
   * questHighlighter.destroy();
   */
  createHighlighter(options?: LocationHighlighterOptions): LocationHighlighter;

  /**
   * Draw custom shapes on the map. The overlay's `render` is called whenever
   * the map redraws, when the player moves or the displayed area changes, and
   * whenever you call `handle.invalidate()`. Coordinates are map (room)
   * coordinates - read them from `state.getRoom(id)`; one grid step is 1.
   *
   * Registering again with the same id replaces the previous overlay. Overlays
   * are removed automatically when the plugin unloads.
   *
   * @param id - Overlay id, unique within this plugin
   * @param overlay - Overlay definition with a `render` function
   * @returns Handle to redraw or remove the overlay
   *
   * @example
   * // Ring around every room next to the player
   * const radar = api.map.addOverlay("radar", {
   *   render(state) {
   *     const room = state.currentRoomId !== undefined ? state.getRoom(state.currentRoomId) : undefined;
   *     if (!room) return;
   *     return Object.values(room.exits).map((id) => state.getRoom(id)).filter(Boolean).map((next) => ({
   *       type: "circle", cx: next!.x, cy: next!.y, radius: 0.6,
   *       paint: { stroke: "#00ff00", strokeWidth: 0.1 },
   *     }));
   *   },
   * });
   * radar.invalidate(); // redraw after your own data changed
   * radar.remove();
   */
  addOverlay(id: string, overlay: MapOverlayDefinition): MapOverlayHandle;

  /**
   * Apply live edits to the loaded map for the current session.
   *
   * Rooms returned by {@link getRoom} / {@link getRoomById} are live references,
   * so a plugin can already mutate their fields — but the renderer caches area
   * geometry and the pathfinder caches exits, so a raw mutation either does not
   * show up or leaves pathfinding stale. This applies the change *and* performs
   * the rebuild/redraw the internal map scripts do (see `labyrinth.ts`,
   * `tideSystem.ts`), which is the part a plugin cannot reach on its own.
   *
   * Changes live in memory only: they are lost when the map data reloads.
   *
   * @param changes - Room patches to apply. Each entry names a room and the
   *   fields to overwrite; `userData` is merged key-by-key, with `null` values
   *   deleting a key. Unknown room IDs are skipped.
   * @param options - Control how much gets rebuilt. Defaults are safe but do
   *   more work than a cosmetic change needs.
   * @returns Number of rooms actually changed.
   *
   * @example
   * // Rename a room and redraw
   * api.map.applyChanges([{ roomId: 3554, name: "Kowal, Daevon" }]);
   *
   * @example
   * // Cosmetic-only change: skip the pathfinder rebuild
   * api.map.applyChanges(
   *   [{ roomId: 3554, roomChar: "K" }],
   *   { rebuildPaths: false }
   * );
   *
   * @example
   * // Structural change — exits need both rebuilds (the default)
   * api.map.applyChanges([{ roomId: 100, exits: { north: 101 } }]);
   *
   * @example
   * // Moving a room; coordinates need the area geometry rebuild
   * api.map.applyChanges([{ roomId: 100, x: 12, y: -3, z: 0 }]);
   */
  applyChanges(changes: RoomChange[], options?: ApplyChangesOptions): number;

  /**
   * Replace whole areas of the loaded map for the current session.
   *
   * The complete counterpart to {@link applyChanges}: an area carries its rooms
   * *and* its labels, and the renderer caches geometry per area, so swapping one
   * covers every kind of edit — moved rooms, added or deleted rooms, custom
   * lines, labels — without the caller having to describe what changed.
   *
   * Pass areas in the same shape as the published map export
   * (`{ areaId, areaName, rooms, labels }`) with coordinates in source
   * orientation; y is flipped for you, exactly as when the map first loads.
   * Areas the map does not already contain are skipped, since adding one needs a
   * full reload. Leave `labels` out to keep the area's current labels - handy
   * when adding rooms to an area read through {@link getAreas}, which returns
   * rooms only (with y already flipped: negate it back before passing them in).
   *
   * Changes live in memory only: they are lost when the map data reloads.
   *
   * @returns Number of areas replaced.
   *
   * @example
   * const replaced = api.map.syncAreas([{ areaId: 12, areaName: "Rinde", rooms, labels }]);
   */
  syncAreas(areas: MapAreaData[]): number;

  /**
   * Replace the whole loaded map for the current session.
   *
   * The heaviest of the three live-edit entry points, and the only one that can
   * change the *set* of areas — {@link syncAreas} can replace an area's contents
   * but not add one, because the renderer builds its area wrappers at load time.
   * Everything is rebuilt: reader, pathfinder, hashes, area index.
   *
   * Takes the same shape the map is published in (an array of areas, as in
   * `mapExport.json`) with coordinates in source orientation. The player's
   * position is kept when the new map still contains that room, and the current
   * colour palette is reused unless you pass a new one.
   *
   * In-memory only: the next map data refresh replaces this again.
   *
   * @returns false when the payload contained no areas; nothing changed.
   *
   * @example
   * api.map.replaceMap(mapData, colors);
   */
  replaceMap(mapData: MapData.Map, colors?: MapData.Env[]): boolean;

  /**
   * Room id for a room's `internal_id` (its user data), the id that stays the
   * same across map versions and the Mudlet mapper. Null when no room has it.
   *
   * @example
   * ```typescript
   * const roomId = api.map.getRoomIdByInternalId("i385831173");
   * ```
   */
  getRoomIdByInternalId(internalId: string): number | null;

  /**
   * Walking distance in steps from one room to each of several others, in one
   * search (the same weights as findPath). Unreachable rooms map to null.
   *
   * @example
   * ```typescript
   * const here = api.map.getRoom()?.id;
   * const steps = api.map.getRoomDistances(here, foundRooms);
   * ```
   */
  getRoomDistances(fromId: number, toIds: number[]): Map<number, number | null>;

  /**
   * Lead the player to a room, as the map's "Prowadź" does: the route is drawn
   * on the map and followed by the direction keys.
   */
  leadTo(roomId: number): void;

  /** Stop leading (clears the drawn route) */
  clearLeadTo(): void;

  /**
   * Add an entry to the room menu (right click on the map or on a room link),
   * under "Pluginy". The action gets the room the menu was opened for.
   * Removed when the plugin unloads.
   *
   * @example
   * ```typescript
   * api.map.addRoomMenuEntry("Jubiler: oznacz sklep", (roomId) => markShop(roomId));
   * ```
   */
  addRoomMenuEntry(label: string, action: (roomId: number) => void): RoomMenuEntryHandle;
}

/** Handle for a room menu entry, see {@link MapApi.addRoomMenuEntry} */
export interface RoomMenuEntryHandle {
  setLabel(label: string): void;
  setAction(action: (roomId: number) => void): void;
  remove(): void;
}

export function createMapApi(ctx: PluginApiContext): MapApi {
  const roomMenuEntryIds = new Set<string>();
  const mapOverlayIds = new Set<string>();
  ctx.onCleanup(() => {
    for (const id of Array.from(roomMenuEntryIds)) unregisterRoomMenuEntry(id);
    roomMenuEntryIds.clear();
    for (const id of Array.from(mapOverlayIds)) unregisterMapOverlay(id);
    mapOverlayIds.clear();
  });
  return {
    getRoom: () => {
      return ctx.client.Map.currentRoom;
    },

    getRoomById: (roomId: number) => {
      return ctx.client.Map.getRoomById(roomId);
    },

    getAreas: (): AreaInfo[] => {
      const mapReader = ctx.client.Map.tryGetMapReader();
      if (!mapReader) {
        return [];
      }
      return mapReader.getAreas().map(area => ({
        areaId: area.getAreaId(),
        areaName: area.getAreaName(),
        rooms: area.getRooms()
      }));
    },

    findPath: (fromId: number, toId: number) => {
      return ctx.client.Map.findPath(fromId, toId);
    },

    setLocation: (roomId: number) => {
      ctx.client.Map.setMapRoomById(roomId);
    },

    getRoomIdByInternalId: (internalId: string) => {
      return ctx.client.Map.getRoomIdByInternalId(internalId);
    },

    getRoomDistances: (fromId: number, toIds: number[]) => {
      return ctx.client.Map.getRoomDistances(fromId, toIds);
    },

    leadTo: (roomId: number) => {
      ctx.client.Map.leadTo(roomId);
    },

    clearLeadTo: () => {
      ctx.client.Map.clearLeadTo();
    },

    addRoomMenuEntry: (label: string, action: (roomId: number) => void): RoomMenuEntryHandle => {
      const id = ctx.generateId("room-menu");
      registerRoomMenuEntry(id, label, action);
      roomMenuEntryIds.add(id);
      return {
        setLabel: (value) => updateRoomMenuEntry(id, { label: value }),
        setAction: (callback) => updateRoomMenuEntry(id, { action: callback }),
        remove: () => {
          unregisterRoomMenuEntry(id);
          roomMenuEntryIds.delete(id);
        },
      };
    },

    stepBack: () => {
      ctx.client.Map.moveBack();
    },

    addOverlay: (id: string, overlay: MapOverlayDefinition): MapOverlayHandle => {
      // Namespaced per plugin so plugins can't clash with each other or with built-in overlays
      const registryId = `plugin:${ctx.pluginId}:${id}`;
      const sceneOverlay = new PluginMapOverlay(`${ctx.pluginId}/${id}`, overlay);
      registerMapOverlay(registryId, sceneOverlay);
      mapOverlayIds.add(registryId);
      return {
        id,
        invalidate: () => sceneOverlay.invalidate(),
        remove: () => {
          // Only remove if this overlay was not replaced by a later addOverlay with the same id
          if (getMapOverlays().get(registryId) === sceneOverlay) {
            unregisterMapOverlay(registryId);
            mapOverlayIds.delete(registryId);
          }
        },
      };
    },

    createHighlighter: (options?: LocationHighlighterOptions): LocationHighlighter => {
      const handle = ctx.client.Map.createHighlighter(options);
      return {
        add: handle.add,
        remove: handle.remove,
        clear: handle.clear,
        enable: handle.enable,
        disable: handle.disable,
        isEnabled: handle.isEnabled,
        setColor: handle.setColor,
        getColor: handle.getColor,
        getRoomIds: handle.getRoomIds,
        destroy: handle.destroy
      };
    },

    applyChanges: (changes: RoomChange[], options?: ApplyChangesOptions): number => {
      return ctx.client.Map.applyRoomChanges(changes, options);
    },

    syncAreas: (areas: MapAreaData[]): number => {
      return ctx.client.Map.syncAreas(areas);
    },

    replaceMap: (mapData: MapData.Map, colors?: MapData.Env[]): boolean => {
      return ctx.client.Map.replaceMap(mapData, colors);
    }
  };
}
