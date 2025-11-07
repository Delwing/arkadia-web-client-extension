/**
 * Plugin API - Bridge between Client and Plugins
 *
 * Provides a stable, versioned API surface for external plugins.
 * This abstraction layer:
 * - Hides internal Client implementation details
 * - Provides a controlled interface for plugin capabilities
 * - Makes it easier to maintain backward compatibility
 */

import type Client from "./Client";
import type { ClientEvents } from "@shared/events";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import type { FormatStateSnapshot } from "@client/ansi/FormatState";
import type {
  Trigger,
  TriggerCallback,
  TriggerPattern,
  TriggerOptions
} from "./Triggers";
import { gmcp } from "./gmcp";
import {
  registerPopupMenuEntry,
  setPopupMenuEntryDisabled,
  unregisterPopupMenuEntry,
  updatePopupMenuEntryLabel,
  registerContextMenuEntry,
  unregisterContextMenuEntry,
  updateContextMenuEntry
} from "@modules/core/pluginUiRegistry";

// Event system types
type EventKey = keyof ClientEvents;
type EventParams<K extends EventKey> = [ClientEvents[K]] extends [void]
  ? []
  : [ClientEvents[K]] extends [any[]]
    ? ClientEvents[K]
    : [ClientEvents[K]];
type EventListener<K extends EventKey> = (...args: EventParams<K>) => void;

/**
 * Alias definition for command aliases
 */
export interface PluginAlias {
  id: string;
  pattern: RegExp;
  callback: (matches?: RegExpMatchArray) => boolean;
}

/**
 * Triggers API
 */
export interface TriggersApi {
  /**
   * Register a trigger that fires when a pattern matches
   * @param pattern - Pattern(s) to match
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   */
  register(
    pattern: TriggerPattern,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Register a one-time trigger (auto-removed after first match)
   * @param pattern - Pattern(s) to match
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   */
  registerOneTime(
    pattern: TriggerPattern,
    callback: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Register a token-based trigger (matches whole words/tokens)
   * Token triggers are optimized for matching whole words rather than regex patterns.
   * They split the line into tokens and match complete token sequences.
   * @param token - Token or phrase to match (will be split by spaces/punctuation)
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   */
  registerToken(
    token: string,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Remove a specific trigger
   * @param trigger - Trigger instance to remove
   */
  remove(trigger: Trigger): void;

  /**
   * Remove all triggers with a specific tag
   * @param tag - Tag to filter by
   */
  removeByTag(tag: string): void;
}

/**
 * Aliases API
 */
export interface AliasesApi {
  /**
   * Register a command alias
   * @param pattern - Regex pattern to match user input
   * @param callback - Function to execute when pattern matches
   * @returns Alias ID for later removal
   */
  register(
    pattern: RegExp,
    callback: (matches?: RegExpMatchArray) => boolean
  ): string;

  /**
   * Remove a command alias by ID
   * @param id - Alias ID returned from register
   */
  remove(id: string): void;
}

/**
 * Events API
 */
export interface EventsApi {
  /**
   * Subscribe to an event
   * @param event - Event name
   * @param listener - Event listener function
   * @param options - Listener options (once, signal)
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
   */
  emit<K extends EventKey>(event: K, ...args: EventParams<K>): void;
}

/**
 * Map API
 */
export interface MapApi {
  /**
   * Get current room information
   * @returns Current room with full details or undefined if not in a room
   */
  getRoom(): MapData.Room | undefined;

  /**
   * Set map location programmatically
   * @param roomId - Room ID to navigate to
   */
  setLocation(roomId: number): void;

  /**
   * Step back to previous map location
   */
  stepBack(): void;
}

/**
 * Output API
 */
export interface OutputApi {
  /**
   * Print text to the game output
   * @param text - Text or buffer to display
   */
  print(text: string | AnsiAwareBuffer): void;
}

/**
 * Popup content that can be rendered inside plugin popups
 */
export type PopupContent = string | Node;

/**
 * Handle for controlling a popup window
 */
export interface PopupHandle {
  /**
   * Root element of the popup window
   */
  element: HTMLDivElement;

  /**
   * Update popup title
   */
  setTitle(title: string): void;

  /**
   * Update popup body content
   */
  setBody(content: PopupContent): void;

  /**
   * Close and remove the popup
   */
  close(): void;
}

/**
 * Handle for a popup menu entry
 */
export interface PopupMenuEntryHandle {
  /**
   * Update the entry label
   */
  setLabel(label: string): void;

  /**
   * Enable or disable the entry
   */
  setDisabled(disabled: boolean): void;

  /**
   * Remove the entry from the menu
   */
  remove(): void;
}

/**
 * Handle for a context menu entry
 */
export interface ContextMenuEntryHandle {
  /**
   * Update the entry label
   */
  setLabel(label: string): void;

  /**
   * Update the entry action
   */
  setAction(action: () => void): void;

  /**
   * Remove the entry from the context menu
   */
  remove(): void;
}

/**
 * UI-related helpers for plugins
 */
export interface UiApi {
  /**
   * Create a draggable popup window
   * @param title - Popup title text
   * @param body - Popup body content (string or DOM node)
   * @returns Popup handle for updates and cleanup
   */
  createPopup(title: string, body: PopupContent): PopupHandle;

  /**
   * Add an entry to the main popup menu
   * @param label - Entry label
   * @param onSelect - Callback when entry is selected
   * @returns Handle to manage the entry
   */
  addPopupMenuEntry(label: string, onSelect: () => void): PopupMenuEntryHandle;

  /**
   * Add an entry to the output context menu
   * @param label - Entry label
   * @param action - Callback when entry is selected
   * @returns Handle to manage the entry
   */
  addContextMenuEntry(label: string, action: () => void): ContextMenuEntryHandle;
}

/**
 * Colors API
 */
export interface ColorsApi {
  /**
   * Create a color from hex string
   * @param hex - Hex color string (e.g., "#ff0000")
   * @returns Color format object
   */
  fromHex(hex: string): FormatStateSnapshot;

  /**
   * Create a color from RGB values
   * @param r - Red (0-255)
   * @param g - Green (0-255)
   * @param b - Blue (0-255)
   * @returns Color format object
   */
  fromRgb(r: number, g: number, b: number): FormatStateSnapshot;
}

/**
 * Function Bind API
 */
export interface BindApi {
  /**
   * Set a function bind - binds a command or callback to a key
   * @param printable - Command string to execute (or null to just use callback)
   * @param callback - Optional callback function to execute instead of sending command
   * @param clearAfterUse - If true, clear the bind after it's used once
   */
  set(printable: string | null, callback?: () => void, clearAfterUse?: boolean): void;

  /**
   * Clear the current function bind
   */
  clear(): void;

  /**
   * Get the current bind label (key combination)
   * @returns Label string like "CTRL+]" or "ALT+SHIFT+K"
   */
  getLabel(): string;
}

/**
 * Team API
 */
export interface TeamApi {
  /**
   * Get list of team member names
   * @returns Array of team member names
   */
  getMembers(): string[];

  /**
   * Get the team leader's name
   * @returns Leader name or undefined if not in a team
   */
  getLeader(): string | undefined;

  /**
   * Get the team leader's object ID
   * @returns Leader object ID or undefined if not in a team
   */
  getLeaderId(): string | undefined;

  /**
   * Get the player's object number
   * @returns Player object number or undefined
   */
  getPlayerNum(): string | undefined;
}

/**
 * GMCP API
 */
export interface GmcpApi {
  /**
   * Get the current GMCP data object
   * Contains all GMCP data received from the server
   * @returns GMCP data object
   */
  get(): Record<string, any>;
}

/**
 * Attack Queue API
 */
export interface AttackQueueApi {
  /**
   * Add an enemy to the attack queue
   * @param id - Object ID of the enemy
   * @returns True if added successfully, false if already in queue
   */
  add(id: string): boolean;

  /**
   * Remove an enemy from the attack queue
   * @param id - Object ID of the enemy
   * @returns True if removed successfully, false if not found
   */
  remove(id: string): boolean;

  /**
   * Clear the entire attack queue
   */
  clear(): void;

  /**
   * Get the current attack queue
   * @returns Array of enemy object IDs in queue order
   */
  get(): string[];
}

/**
 * Location object information
 */
export interface LocationObject {
  /** Object number */
  num: number;
  /** Object description/name */
  desc?: string;
  /** Object state (typically HP) */
  state?: any;
  /** Attack number or boolean indicating combat status */
  attack_num?: boolean | number;
  /** Whether avatar is targeting this object */
  avatar_target?: boolean;
  /** Whether this is an attack target */
  attack_target?: boolean;
  /** Whether this is a defense target */
  defense_target?: boolean;
  /** Shortcut key for this object (e.g., '@', 'A', '1') */
  shortcut?: string;
  /** Category: player, team member, enemy, or non-combat entity */
  __category?: 'player' | 'team' | 'rest' | 'rest-noncombat';
}

/**
 * Objects API
 */
export interface ObjectsApi {
  /**
   * Get all objects in current location
   * Returns objects organized by category (player, team, enemies, non-combat)
   * @returns Array of location objects with shortcuts and categories
   */
  getObjectsOnLocation(): LocationObject[];
}

/**
 * Command API
 */
export interface CommandApi {
  /**
   * Send a command to the server
   * @param command - Command string to send
   * @param echo - Whether to echo the command in the output (default: true)
   * @param options - Additional command options
   */
  send(command: string, echo?: boolean, options?: any): Promise<void>;
}

/**
 * Plugin API Interface
 *
 * This is the main interface that plugins interact with.
 * Provides controlled access to client functionality organized by domain.
 */
export interface PluginApi {
  /** Trigger management */
  triggers: TriggersApi;
  /** Command alias management */
  aliases: AliasesApi;
  /** Event subscription and emission */
  events: EventsApi;
  /** Map position access */
  map: MapApi;
  /** Output to game window */
  output: OutputApi;
  /** UI helpers */
  ui: UiApi;
  /** Color creation helpers */
  colors: ColorsApi;
  /** Function bind management */
  bind: BindApi;
  /** Team management */
  team: TeamApi;
  /** GMCP data access */
  gmcp: GmcpApi;
  /** Attack queue management */
  attackQueue: AttackQueueApi;
  /** Objects in location */
  objects: ObjectsApi;
  /** Command sending */
  command: CommandApi;
  /** AnsiAwareBuffer class for creating formatted text buffers */
  AnsiAwareBuffer: typeof AnsiAwareBuffer;
}

/**
 * Plugin API Implementation
 *
 * Wraps the Client instance and provides the PluginApi interface.
 */
export class PluginApiImpl implements PluginApi {
  private client: Client;
  private aliasMap: Map<string, PluginAlias> = new Map();
  private popupHandles: Set<PopupHandle> = new Set();
  private popupMenuEntryIds: Set<string> = new Set();
  private contextMenuEntryIds: Set<string> = new Set();

  public triggers: TriggersApi;
  public aliases: AliasesApi;
  public events: EventsApi;
  public map: MapApi;
  public output: OutputApi;
  public ui: UiApi;
  public colors: ColorsApi;
  public bind: BindApi;
  public team: TeamApi;
  public gmcp: GmcpApi;
  public attackQueue: AttackQueueApi;
  public objects: ObjectsApi;
  public command: CommandApi;
  public AnsiAwareBuffer: typeof AnsiAwareBuffer;

  constructor(client: Client) {
    this.client = client;

    // Initialize namespaced APIs
    this.triggers = this.createTriggersApi();
    this.aliases = this.createAliasesApi();
    this.events = this.createEventsApi();
    this.map = this.createMapApi();
    this.output = this.createOutputApi();
    this.ui = this.createUiApi();
    this.colors = this.createColorsApi();
    this.bind = this.createBindApi();
    this.team = this.createTeamApi();
    this.gmcp = this.createGmcpApi();
    this.attackQueue = this.createAttackQueueApi();
    this.objects = this.createObjectsApi();
    this.command = this.createCommandApi();

    // Expose AnsiAwareBuffer class
    this.AnsiAwareBuffer = AnsiAwareBuffer;
  }

  // ============================================================================
  // Triggers API
  // ============================================================================

  private createTriggersApi(): TriggersApi {
    return {
      register: (pattern, callback, tag, options) => {
        return this.client.Triggers.registerTrigger(pattern, callback, tag, options);
      },

      registerOneTime: (pattern, callback, tag, options) => {
        return this.client.Triggers.registerOneTimeTrigger(pattern, callback, tag, options);
      },

      registerToken: (token, callback, tag, options) => {
        return this.client.Triggers.registerTokenTrigger(token, callback, tag, options);
      },

      remove: (trigger) => {
        this.client.Triggers.removeTrigger(trigger);
      },

      removeByTag: (tag) => {
        this.client.Triggers.removeByTag(tag);
      }
    };
  }

  // ============================================================================
  // Aliases API
  // ============================================================================

  private createAliasesApi(): AliasesApi {
    return {
      register: (pattern, callback) => {
        const id = Math.random().toString(36).slice(2);
        const alias: PluginAlias = { id, pattern, callback };

        this.aliasMap.set(id, alias);
        this.client.aliases.push({ pattern, callback });

        return id;
      },

      remove: (id) => {
        const alias = this.aliasMap.get(id);
        if (!alias) return;

        // Remove from client aliases array
        const index = this.client.aliases.findIndex(
          a => a.pattern === alias.pattern && a.callback === alias.callback
        );
        if (index !== -1) {
          this.client.aliases.splice(index, 1);
        }

        this.aliasMap.delete(id);
      }
    };
  }

  // ============================================================================
  // Events API
  // ============================================================================

  private createEventsApi(): EventsApi {
    return {
      on: (event, listener, options) => {
        this.client.on(event, listener as any, options);
      },

      off: (event, listener) => {
        this.client.off(event, listener as any);
      },

      emit: (event, ...args) => {
        this.client.sendEvent(event, ...args);
      }
    };
  }

  // ============================================================================
  // Map API
  // ============================================================================

  private createMapApi(): MapApi {
    return {
      getRoom: () => {
        return this.client.Map.currentRoom;
      },

      setLocation: (roomId: number) => {
        this.client.Map.setMapRoomById(roomId);
      },

      stepBack: () => {
        this.client.Map.moveBack();
      }
    };
  }

  // ============================================================================
  // Output API
  // ============================================================================

  private createOutputApi(): OutputApi {
    return {
      print: (text) => {
        this.client.print(text);
      }
    };
  }

  // ============================================================================
  // UI API
  // ============================================================================

  private createUiApi(): UiApi {
    return {
      createPopup: (title, body) => this.createPopup(title, body),
      addPopupMenuEntry: (label, onSelect) => this.addPopupMenuEntry(label, onSelect),
      addContextMenuEntry: (label, action) => this.addContextMenuEntry(label, action)
    };
  }

  // ============================================================================
  // Colors API
  // ============================================================================

  private createColorsApi(): ColorsApi {
    return {
      fromHex: (hex) => {
        return { foreground: { space: "hex", color: hex } };
      },

      fromRgb: (r, g, b) => {
        return { foreground: { space: "rgb", r, g, b } };
      }
    };
  }

  // ============================================================================
  // Bind API
  // ============================================================================

  private createBindApi(): BindApi {
    return {
      set: (printable, callback, clearAfterUse) => {
        this.client.FunctionalBind.set(printable, callback, clearAfterUse);
      },

      clear: () => {
        this.client.FunctionalBind.clear();
      },

      getLabel: () => {
        return this.client.FunctionalBind.getLabel();
      }
    };
  }

  // ============================================================================
  // Team API
  // ============================================================================

  private createTeamApi(): TeamApi {
    return {
      getMembers: () => {
        return this.client.TeamManager.getTeamMembers();
      },

      getLeader: () => {
        return this.client.TeamManager.getLeader();
      },

      getLeaderId: () => {
        return this.client.TeamManager.getLeaderId();
      },

      getPlayerNum: () => {
        return this.client.TeamManager.playerNum;
      }
    };
  }

  // ============================================================================
  // GMCP API
  // ============================================================================

  private createGmcpApi(): GmcpApi {
    return {
      get: () => {
        return gmcp;
      }
    };
  }

  // ============================================================================
  // Attack Queue API
  // ============================================================================

  private createAttackQueueApi(): AttackQueueApi {
    return {
      add: (id) => {
        return this.client.TeamManager.addEnemyToQueue(id);
      },

      remove: (id) => {
        return this.client.TeamManager.removeEnemyFromQueue(id);
      },

      clear: () => {
        this.client.TeamManager.clearEnemyQueue();
      },

      get: () => {
        return this.client.TeamManager.getEnemyQueue();
      }
    };
  }

  // ============================================================================
  // Objects API
  // ============================================================================

  private createObjectsApi(): ObjectsApi {
    return {
      getObjectsOnLocation: () => {
        return this.client.ObjectManager.getObjectsOnLocation();
      }
    };
  }

  // ============================================================================
  // Command API
  // ============================================================================

  private createCommandApi(): CommandApi {
    return {
      send: async (command, echo, options) => {
        await this.client.sendCommand(command, echo, options);
      }
    };
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Cleanup method called when plugin is unloaded
   * Removes all registered aliases
   */
  cleanup(): void {
    // Remove all aliases registered by this plugin
    for (const id of this.aliasMap.keys()) {
      this.aliases.remove(id);
    }
    this.aliasMap.clear();

    for (const popup of Array.from(this.popupHandles)) {
      popup.close();
    }
    this.popupHandles.clear();

    for (const id of Array.from(this.popupMenuEntryIds)) {
      unregisterPopupMenuEntry(id);
    }
    this.popupMenuEntryIds.clear();

    for (const id of Array.from(this.contextMenuEntryIds)) {
      unregisterContextMenuEntry(id);
    }
    this.contextMenuEntryIds.clear();
  }

  private createPopup(title: string, body: PopupContent): PopupHandle {
    const overlay = document.createElement("div");
    overlay.className = "herb-overlay";

    const windowEl = document.createElement("div");
    windowEl.className = "herb-window herb-window--center";
    windowEl.tabIndex = -1;

    const header = document.createElement("div");
    header.className = "herb-window-header";

    const titleEl = document.createElement("h5");
    titleEl.className = "herb-window-title";
    titleEl.textContent = title;

    const actions = document.createElement("div");
    actions.className = "window-header-actions";
    actions.addEventListener("pointerdown", event => event.stopPropagation());

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn-close";
    actions.appendChild(closeButton);

    header.appendChild(titleEl);
    header.appendChild(actions);

    const bodyContainer = document.createElement("div");
    bodyContainer.className = "herb-window-body";

    const clearBody = () => {
      while (bodyContainer.firstChild) {
        bodyContainer.removeChild(bodyContainer.firstChild);
      }
    };

    const setBodyContent = (content: PopupContent) => {
      clearBody();
      if (typeof content === "string") {
        bodyContainer.innerHTML = content;
      } else if (content instanceof Node) {
        bodyContainer.appendChild(content);
      }
    };

    setBodyContent(body);

    windowEl.appendChild(header);
    windowEl.appendChild(bodyContainer);

    let pointerId: number | null = null;
    let offsetX = 0;
    let offsetY = 0;

    const margin = 16;

    const handlePointerMove = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId) {
        return;
      }
      const rect = windowEl.getBoundingClientRect();
      const maxLeft = window.innerWidth - rect.width - margin;
      const maxTop = window.innerHeight - rect.height - margin;
      const nextLeft = Math.min(Math.max(event.clientX - offsetX, margin), Math.max(margin, maxLeft));
      const nextTop = Math.min(Math.max(event.clientY - offsetY, margin), Math.max(margin, maxTop));
      windowEl.style.left = `${nextLeft}px`;
      windowEl.style.top = `${nextTop}px`;
    };

    const endPointerDrag = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId) {
        return;
      }
      pointerId = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endPointerDrag);
      window.removeEventListener("pointercancel", endPointerDrag);
    };

    const startPointerDrag = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      const rect = windowEl.getBoundingClientRect();
      pointerId = event.pointerId;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      windowEl.classList.add("herb-window--floating");
      windowEl.classList.remove("herb-window--center");
      windowEl.style.left = `${rect.left}px`;
      windowEl.style.top = `${rect.top}px`;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", endPointerDrag);
      window.addEventListener("pointercancel", endPointerDrag);
      event.preventDefault();
    };

    header.addEventListener("pointerdown", startPointerDrag);

    let closed = false;
    let handle: PopupHandle;

    const overlayListener = (event: MouseEvent) => {
      if (event.target === overlay) {
        closePopup();
      }
    };

    const keyListener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePopup();
      }
    };

    const closeButtonListener = () => {
      closePopup();
    };

    const closePopup = () => {
      if (closed) {
        return;
      }
      closed = true;
      header.removeEventListener("pointerdown", startPointerDrag);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endPointerDrag);
      window.removeEventListener("pointercancel", endPointerDrag);
      window.removeEventListener("keydown", keyListener);
      overlay.removeEventListener("click", overlayListener);
      closeButton.removeEventListener("click", closeButtonListener);
      overlay.remove();
      windowEl.remove();
      this.popupHandles.delete(handle);
    };

    handle = {
      element: windowEl,
      setTitle: (value) => {
        titleEl.textContent = value;
      },
      setBody: (content) => {
        setBodyContent(content);
      },
      close: closePopup
    };

    overlay.addEventListener("click", overlayListener);
    closeButton.addEventListener("click", closeButtonListener);
    window.addEventListener("keydown", keyListener);

    document.body.appendChild(overlay);
    document.body.appendChild(windowEl);
    windowEl.focus();

    this.popupHandles.add(handle);

    return handle;
  }

  private addPopupMenuEntry(label: string, onSelect: () => void): PopupMenuEntryHandle {
    const id = this.generateId("popup-menu");
    registerPopupMenuEntry(id, label, onSelect);
    this.popupMenuEntryIds.add(id);

    return {
      setLabel: (value) => {
        updatePopupMenuEntryLabel(id, value);
      },
      setDisabled: (disabled) => {
        setPopupMenuEntryDisabled(id, disabled);
      },
      remove: () => {
        unregisterPopupMenuEntry(id);
        this.popupMenuEntryIds.delete(id);
      }
    };
  }

  private addContextMenuEntry(label: string, action: () => void): ContextMenuEntryHandle {
    const id = this.generateId("context-menu");
    registerContextMenuEntry(id, label, action);
    this.contextMenuEntryIds.add(id);

    return {
      setLabel: (value) => {
        updateContextMenuEntry(id, { label: value });
      },
      setAction: (callback) => {
        updateContextMenuEntry(id, { action: callback });
      },
      remove: () => {
        unregisterContextMenuEntry(id);
        this.contextMenuEntryIds.delete(id);
      }
    };
  }

  private generateId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
