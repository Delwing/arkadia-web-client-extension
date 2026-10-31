import type { ClientEvents } from "@shared/events";
import type { PluginApiContext } from "./context";

// Event system types
/**
 * Valid event names from ClientEvents
 */
export type EventKey = keyof ClientEvents;

/**
 * Event parameters for a given event key
 */
export type EventParams<K extends EventKey> = [ClientEvents[K]] extends [void]
  ? []
  : [ClientEvents[K]] extends [any[]]
    ? ClientEvents[K]
    : [ClientEvents[K]];

/**
 * Event listener function type for a given event key
 */
export type EventListener<K extends EventKey> = (...args: EventParams<K>) => void;

/**
 * Events API - Subscribe to and emit events
 */
export interface EventsApi {
  /**
   * Subscribe to an event
   * @param event - Event name (see ClientEvents for available events)
   * @param listener - Event listener function
   * @param options - Listener options (once, signal)
   *
   * @example
   * ```typescript
   * // Subscribe to map movement
   * api.events.on("mapMove", () => {
   *   console.log("Player moved!");
   * });
   *
   * // Subscribe to GMCP with typed payload
   * api.events.on("gmcp", (data) => {
   *   console.log("GMCP:", data.path, data.value);
   * });
   *
   * // Subscribe to specific GMCP path
   * api.events.on("gmcp.room.info", (roomData) => {
   *   console.log("Room info:", roomData);
   * });
   * ```
   */
  on<K extends EventKey>(
    event: K,
    listener: EventListener<K>,
    options?: boolean | { once?: boolean; signal?: AbortSignal }
  ): void;

  /**
   * Unsubscribe from an event
   * @param event - Event name
   * @param listener - Event listener function to remove
   */
  off<K extends EventKey>(event: K, listener: EventListener<K>): void;

  /**
   * Emit an event
   * @param event - Event name
   * @param args - Event arguments
   *
   * @example
   * ```typescript
   * // Emit an in-app notification (a toast; see also api.notifications)
   * api.events.emit("notify", { text: "Hello!", time: 5000 });
   *
   * // Also fire an OS/browser notification (when the user granted permission)
   * api.events.emit("notify", { text: "Hello!", system: true });
   *
   * // Send a command
   * api.events.emit("sendCommand", { command: "look", echo: true });
   * ```
   */
  emit<K extends EventKey>(event: K, ...args: EventParams<K>): void;
}

export function createEventsApi(ctx: PluginApiContext): EventsApi {
  return {
    on: (event, listener, options) => {
      ctx.client.on(event, listener as any, options);
    },

    off: (event, listener) => {
      ctx.client.off(event, listener as any);
    },

    emit: (event, ...args) => {
      if (event === 'notify' && args[0]) {
        // So the player can mute plugin toasts as a group.
        const payload = args[0] as ClientEvents['notify'];
        ctx.client.sendEvent('notify', { ...payload, source: payload.source ?? 'plugin' });
        return;
      }
      ctx.client.sendEvent(event, ...args);
    }
  };
}
