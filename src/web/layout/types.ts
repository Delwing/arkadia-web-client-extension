export type DockPosition = 'LEFT' | 'TOP' | 'RIGHT';

export type PanelId = 'map' | 'objectList' | string;

// Built-in popup types
export type BuiltInPopupType =
  | 'clock'
  | 'contracts'
  | 'letter'
  | 'herb'
  | 'knowledgeReport'
  | 'knowledgeDetails'
  | 'chat'
  | 'combat'
  | 'postepy'
  | 'postepy2'
  | 'zabici'
  | 'zabici2'
  | 'skroty'
  | 'peopleBrowser'
  | 'objectListDemo'
  | 'walker'
  | 'poczta'
  | 'fishing'
  | 'letter-view'
  | 'loot'
  | 'roomInfo'
  | 'staticmap'
  | 'tripPlanner'
  | 'deposits'
  | 'packageReceiver'
  | 'profession'
  | 'sunTracker'
  | 'transport-route'
  | 'zlom';

// Plugin popup type pattern: plugin:{pluginId}:{instanceId}
export type PluginPopupType = `plugin:${string}`;

export type PopupType = BuiltInPopupType | PluginPopupType;

export interface PanelState {
  id: PanelId;
  /** Position in dock (0 = first, 1 = second, etc.) */
  order: number;
  /** Size as percentage (for TOP: width%, for LEFT/RIGHT: height%) */
  size: number;
}

export interface FloatingPanelState {
  id: PanelId;
  /** Position in viewport */
  x: number;
  y: number;
  /** Size in pixels */
  width: number;
  /** Height in pixels. When undefined, panel auto-sizes to content */
  height?: number;
}

/**
 * A slot within a dock that can contain multiple stacked panels.
 * - In TOP dock: slots are columns (side by side), panels within stack vertically
 * - In LEFT/RIGHT docks: slots are rows (stacked vertically), panels within are side by side
 */
export interface DockSlot {
  id: string;
  /** Panels within this slot */
  panels: PanelState[];
  /** Size as percentage of the dock */
  size: number;
}

export interface DockState {
  /** Size of the dock zone (LEFT/RIGHT: width in px, TOP: height in px) */
  size: number;
  /** Slots containing panels. For backward compatibility, also check legacy 'panels' field */
  slots: DockSlot[];
}

/** Legacy DockState with flat panels array (for migration) */
export interface LegacyDockState {
  size: number;
  panels: PanelState[];
}

/** State for built-in panels (map, objectList) */
export interface BuiltInPanelState {
  isLocked?: boolean;
  /** Dynamic title override (e.g., "Mapa (Area Name)" when viewing different area) */
  title?: string;
  /** Panel-specific settings (e.g., view mode toggles) */
  settings?: Record<string, unknown>;
}

export interface LayoutState {
  /** Whether layout manager mode is enabled */
  enabled: boolean;
  /** Which panels are managed by layout manager (map is always managed when enabled) */
  enabledPanels: {
    objectList: boolean;
  };
  /** Dock zones */
  docks: {
    left: DockState;
    top: DockState;
    right: DockState;
  };
  /** Floating (undocked) panels */
  floatingPanels: FloatingPanelState[];
  /** Popup panel dock preferences - remembers last state per popup */
  popupPanels: Record<string, PopupPanelDockState>;
  /** Built-in panel states (map, objectList) */
  builtInPanels: Record<string, BuiltInPanelState>;
}

export interface DragState {
  panelId: PanelId;
  sourcePosition: DockPosition | 'floating';
  currentPosition: { x: number; y: number };
  potentialDock: DockPosition | null;
  /** Index of the slot to insert into or create at */
  insertIndex: number | null;
  /** If set, insert panel into existing slot at this index instead of creating new slot */
  insertIntoSlotId: string | null;
  /** Position within the slot (for stacking) */
  insertPositionInSlot: number | null;
  /** True when dropping outside dock zones (will create floating panel) */
  willFloat: boolean;
  /** True when Ctrl key is held (disables docking) */
  ctrlHeld: boolean;
}

export interface PanelConfig {
  id: PanelId;
  title: string;
  closable: boolean;
  minWidth?: number;
  minHeight?: number;
}

// Popup-specific panel configuration
export interface PopupPanelConfig extends PanelConfig {
  type: 'popup';
  popupType: PopupType;
  initialWidth: number;
  initialHeight?: number;
  bodyClassName?: string;
}

// State for a popup panel (used in storage)
export interface PopupPanelDockState {
  isDocked: boolean;
  dockPosition?: DockPosition;
  dockOrder?: number;
  dockSize?: number; // percentage
  floatingState?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** If true, popup should auto-open on page load */
  persistOpen?: boolean;
  /** If true, user has explicitly moved/resized the popup */
  userModifiedPosition?: boolean;
  /** If true, popup is locked (prevents dragging and resizing) */
  isLocked?: boolean;
  /** Popup-specific settings (e.g., filters, sort modes) */
  settings?: Record<string, unknown>;
}

export const PANEL_CONFIGS: Record<string, PanelConfig> = {
  map: {
    id: 'map',
    title: 'Mapa',
    closable: false,
    minWidth: 150,
    minHeight: 150,
  },
  objectList: {
    id: 'objectList',
    title: 'Kondycje',
    closable: false,
    minWidth: 100,
    minHeight: 100,
  },
};

export const DEFAULT_LAYOUT: LayoutState = {
  enabled: false,
  enabledPanels: {
    objectList: true,
  },
  docks: {
    left: { size: 200, slots: [] },
    top: { size: 200, slots: [] },
    right: {
      size: 360,
      slots: [
        {
          id: 'slot-map',
          panels: [{ id: 'map', order: 0, size: 100 }],
          size: 50,
        },
        {
          id: 'slot-objectList',
          panels: [{ id: 'objectList', order: 0, size: 100 }],
          size: 50,
        },
      ],
    },
  },
  floatingPanels: [],
  popupPanels: {},
  builtInPanels: {},
};

/** Generate a unique slot ID */
export function generateSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Migrate legacy dock state (flat panels array) to new slots structure.
 * Each panel becomes its own single-panel slot.
 */
export function migrateLegacyDockState(legacy: LegacyDockState): DockState {
  return {
    size: legacy.size,
    slots: legacy.panels.map((panel) => ({
      id: `slot-${panel.id}`,
      panels: [{ ...panel, size: 100 }],
      size: panel.size,
    })),
  };
}

export const MIN_DOCK_SIZE = 100;
export const MAX_DOCK_SIZE_RATIO = 0.4; // Max 40% of viewport
