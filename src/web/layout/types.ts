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
  | 'combat';

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

export interface DockState {
  /** Size of the dock zone (LEFT/RIGHT: width in px, TOP: height in px) */
  size: number;
  panels: PanelState[];
}

/** State for built-in panels (map, objectList) */
export interface BuiltInPanelState {
  isLocked?: boolean;
  /** Dynamic title override (e.g., "Mapa (Area Name)" when viewing different area) */
  title?: string;
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
  insertIndex: number | null;
  /** True when dropping outside dock zones (will create floating panel) */
  willFloat: boolean;
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
    left: { size: 200, panels: [] },
    top: { size: 200, panels: [] },
    right: { size: 360, panels: [{ id: 'map', order: 0, size: 50 }, { id: 'objectList', order: 1, size: 50 }] },
  },
  floatingPanels: [],
  popupPanels: {},
  builtInPanels: {},
};

export const MIN_DOCK_SIZE = 100;
export const MAX_DOCK_SIZE_RATIO = 0.4; // Max 40% of viewport
