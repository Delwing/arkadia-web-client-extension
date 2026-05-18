// Dock side identifiers used by the WindowManager and DockArea components.
// Lowercase is the canonical form used internally; the uppercase DockPosition
// alias is kept for backward compatibility with existing call sites.
export type DockSide = 'left' | 'right' | 'top' | 'bottom';
export type DockPosition = 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM';

export const sideOf = (p: DockPosition): DockSide =>
  p.toLowerCase() as DockSide;
export const positionOf = (s: DockSide): DockPosition =>
  s.toUpperCase() as DockPosition;

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
  | 'zlom'
  | 'stat';

// Plugin popup type pattern: plugin:{pluginId}:{instanceId}
export type PluginPopupType = `plugin:${string}`;

export type PopupType = BuiltInPopupType | PluginPopupType;

/**
 * Flat per-window record. Owned by the WindowManager and persisted between
 * sessions for known windows. Mirrors mudix's ScriptWindowRenderData so the
 * docking / tab / split logic can be ported directly.
 *
 * Slot grouping is *implicit* — it's derived from these fields rather than
 * stored as nested arrays:
 *  - same `docked` side + same `dockOrder` = same slot (single window).
 *  - share a `dockGroup` = tab group within a slot.
 *  - share a `splitGroup` = split group within a slot.
 */
export interface WindowRecord {
  id: PanelId;
  title: string;
  visible: boolean;

  // Floating geometry (always present; only used when not docked)
  x: number;
  y: number;
  width: number;
  /** When undefined, panel auto-sizes its height to content (popups). */
  height?: number;
  zIndex: number;

  // Dock placement (undefined = floating)
  docked?: DockSide;
  /** Slot position within the dock side. */
  dockOrder?: number;
  /** Slot size (flex value). */
  dockFlex?: number;

  // Tab grouping (panels with same dockGroup share a tab bar)
  dockGroup?: string;
  tabOrder?: number;
  isActiveTab?: boolean;

  // Split grouping (panels with same splitGroup are arranged cross-axis)
  splitGroup?: string;
  splitOrder?: number;
  splitFlex?: number;

  // Popup-only metadata mirrored into the record while it's open so the
  // shell components can react to it without consulting the popup registry.
  isPinned?: boolean;
  isLocked?: boolean;
}

export interface DragState {
  panelId: PanelId;
  /** Side under cursor or null if not over a dock zone. */
  potentialDock: DockSide | null;
  /** Slot index for a positional-insert drop. */
  insertSlotIndex: number | null;
  /** Center-zone drop — stacks into an existing slot as a tab. */
  stackTargetId?: string;
  /** Cross-axis edge drop — joins/creates a split group. */
  splitTargetId?: string;
  /** true = insert before target (in split), false = after. */
  splitBefore?: boolean;
  /** Whether Ctrl is held — forces floating regardless of cursor zone. */
  ctrlHeld?: boolean;
}

/** State stored per popup so position/dock are remembered while closed. */
export interface PopupPanelDockState {
  isDocked: boolean;
  dockPosition?: DockPosition;
  dockOrder?: number;
  dockSize?: number; // percentage
  floatingState?: {
    x: number;
    y: number;
    width: number;
    /** Undefined for auto-height popups. */
    height?: number;
  };
  /** If true, popup should auto-open on page load. */
  persistOpen?: boolean;
  /** If true, user has explicitly moved/resized the popup. */
  userModifiedPosition?: boolean;
  /** If true, popup is locked (prevents dragging and resizing). */
  isLocked?: boolean;
  /** Popup-specific settings (filters, sort modes, etc.). */
  settings?: Record<string, unknown>;
}

/** State for built-in panels (map, objectList). */
export interface BuiltInPanelState {
  isLocked?: boolean;
  /** Dynamic title override. */
  title?: string;
  /** Panel-specific settings. */
  settings?: Record<string, unknown>;
}

export interface LayoutState {
  /** Whether layout manager mode is enabled. */
  enabled: boolean;
  /** Which panels are managed by layout manager. */
  enabledPanels: {
    objectList: boolean;
  };
  /** Per-window state (the canonical store). */
  windows: Record<string, WindowRecord>;
  /** Extent (size in px) of each dock side. */
  dockExtents: Record<DockSide, number>;
  /** Popup dock preferences — survives popup close. */
  popupPanels: Record<string, PopupPanelDockState>;
  /** Built-in panel states. */
  builtInPanels: Record<string, BuiltInPanelState>;
}

// ─── Panel configs ────────────────────────────────────────────────────────

export interface PanelConfig {
  id: PanelId;
  title: string;
  closable: boolean;
  minWidth?: number;
  minHeight?: number;
}

export interface PopupPanelConfig extends PanelConfig {
  type: 'popup';
  popupType: PopupType;
  initialWidth: number;
  initialHeight?: number;
  bodyClassName?: string;
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

export const MIN_DOCK_SIZE = 100;
export const MAX_DOCK_SIZE_RATIO = 0.4; // Max 40% of viewport

export const DEFAULT_DOCK_EXTENTS: Record<DockSide, number> = {
  left: 200,
  right: 360,
  top: 200,
  bottom: 200,
};

export const DEFAULT_LAYOUT: LayoutState = {
  enabled: false,
  enabledPanels: {
    objectList: true,
  },
  windows: {
    map: {
      id: 'map',
      title: PANEL_CONFIGS.map.title,
      visible: true,
      x: 0,
      y: 0,
      width: 360,
      height: 280,
      zIndex: 10,
      docked: 'right',
      dockOrder: 0,
      dockFlex: 1,
    },
    objectList: {
      id: 'objectList',
      title: PANEL_CONFIGS.objectList.title,
      visible: true,
      x: 0,
      y: 0,
      width: 360,
      height: 200,
      zIndex: 11,
      docked: 'right',
      dockOrder: 1,
      dockFlex: 1,
    },
  },
  dockExtents: { ...DEFAULT_DOCK_EXTENTS },
  popupPanels: {},
  builtInPanels: {},
};

// ─── ID generators ────────────────────────────────────────────────────────

let _idCounter = 0;
const _idBase = () => Date.now().toString(36) + (++_idCounter).toString(36);

export function generateSlotId(): string {
  return `slot-${_idBase()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateTabGroupId(): string {
  return `tabs-${_idBase()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateSplitGroupId(): string {
  return `split-${_idBase()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Legacy shape (used only during migration) ────────────────────────────

export interface LegacyPanelState {
  id: PanelId;
  order: number;
  size: number;
}

export interface LegacyDockSlot {
  id: string;
  panels: LegacyPanelState[];
  size: number;
}

export interface LegacyDockState {
  size: number;
  slots?: LegacyDockSlot[];
  panels?: LegacyPanelState[]; // pre-slot legacy format
}

export interface LegacyFloatingPanelState {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height?: number;
}

export interface LegacyLayoutState {
  enabled?: boolean;
  enabledPanels?: { objectList?: boolean };
  docks?: {
    left?: LegacyDockState;
    top?: LegacyDockState;
    right?: LegacyDockState;
    bottom?: LegacyDockState;
  };
  floatingPanels?: LegacyFloatingPanelState[];
  popupPanels?: Record<string, PopupPanelDockState>;
  builtInPanels?: Record<string, BuiltInPanelState>;
}

/** @deprecated Kept for typecompat — DockSlot is now derived, not stored. */
export interface DockSlot {
  id: string;
  panels: Array<{ id: PanelId; order: number; size: number }>;
  size: number;
}

/** @deprecated kept for compat — derived from WindowRecord at render time. */
export interface FloatingPanelState {
  id: PanelId;
  x: number;
  y: number;
  width: number;
  height?: number;
}

/** @deprecated kept for compat. */
export interface PanelState {
  id: PanelId;
  order: number;
  size: number;
}
