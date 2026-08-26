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

// ─── Recursive dock layout tree ───────────────────────────────────────────
// Each dock side owns a tree. The root is always a SplitNode whose `dir` is the
// side's primary axis (left/right -> 'col', top/bottom -> 'row'), so the root's
// direct children are the classic "slots". Deeper nesting gives arbitrary
// splits. Sizing lives ONLY in SplitNode.sizes (parallel to children) — leaves
// have no intrinsic size.

export type SplitDir = 'row' | 'col';

export interface SplitNode {
  kind: 'split';
  id: string;
  /** 'row' = children laid left->right; 'col' = children laid top->bottom. */
  dir: SplitDir;
  children: LayoutNode[];
  /** Flex value per child, parallel to `children`. */
  sizes: number[];
}

export interface LeafNode {
  kind: 'leaf';
  id: string;
  /** Tab group; array order is tab order. Empty array = placeholder cell. */
  windowIds: string[];
  /** Active tab id ('' when the leaf is an empty placeholder). */
  activeId: string;
  /** True when this is an intentional empty cell (kept by normalize). */
  placeholder?: true;
}

export type LayoutNode = SplitNode | LeafNode;

export const primaryDir = (side: DockSide): SplitDir =>
  side === 'top' || side === 'bottom' ? 'row' : 'col';
export const crossDir = (side: DockSide): SplitDir =>
  primaryDir(side) === 'row' ? 'col' : 'row';

// Built-in popup types
export type BuiltInPopupType =
  | 'clock'
  | 'worldTime'
  | 'contracts'
  | 'letter'
  | 'herb'
  | 'knowledgeReport'
  | 'knowledgeDetails'
  | 'chat'
  | 'combat'
  | 'combatStatus'
  | 'postepy'
  | 'postepy2'
  | 'cechy'
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
  | 'transport-times-debug'
  | 'zlom'
  | 'stat'
  | 'oswajanie'
  | 'dataSources'
  | 'assistant';

// Plugin popup type pattern: plugin:{pluginId}:{instanceId}
export type PluginPopupType = `plugin:${string}`;

export type PopupType = BuiltInPopupType | PluginPopupType;

/**
 * Flat per-window record. Owned by the WindowManager and persisted between
 * sessions for known windows. Mirrors mudix's ScriptWindowRenderData so the
 * docking / tab / split logic can be ported directly.
 *
 * Structure (slot order, splits, tabs) lives in `LayoutState.dockTrees` — a
 * recursive per-side tree of SplitNode/LeafNode. `docked` is kept on the record
 * as a *synced cache* of which side's tree contains this window (written only by
 * WindowManager.syncDockedFlags). The legacy flat structural fields below
 * (dockOrder/dockFlex/dockGroup/tabOrder/isActiveTab/splitGroup/splitOrder/
 * splitFlex) are deprecated — they exist only so old persisted state can be
 * migrated into trees; nothing reads them at render time anymore.
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

  // Dock placement cache (undefined = floating). Which side's tree holds this
  // window — written only by WindowManager.syncDockedFlags().
  docked?: DockSide;

  /** @deprecated structure lives in dockTrees; kept only for migration. */
  dockOrder?: number;
  /** @deprecated */ dockFlex?: number;
  /** @deprecated */ dockGroup?: string;
  /** @deprecated */ tabOrder?: number;
  /** @deprecated */ isActiveTab?: boolean;
  /** @deprecated */ splitGroup?: string;
  /** @deprecated */ splitOrder?: number;
  /** @deprecated */ splitFlex?: number;

  // Popup-only metadata mirrored into the record while it's open so the
  // shell components can react to it without consulting the popup registry.
  isPinned?: boolean;
  isLocked?: boolean;

  /** When true, the window is detached into a separate browser window
   *  (popout). It keeps all its dock / floating / tab / split fields so it
   *  can be restored to its prior location when the popout closes. The main
   *  shells skip rendering it; PopoutWindowLayer owns the external window.
   *  Never persisted — healed to false on loadState. */
  poppedOut?: boolean;
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
  /** Axis of the intended split (perpendicular = wrap, same as parent = sibling). */
  splitDir?: SplitDir;
  /** Drop into an empty placeholder leaf with this node id. */
  fillLeafId?: string;
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

/**
 * Which pair of edge docks spans the full extent of the shell:
 *   - 'topBottom' (default): top/bottom span the full width, left/right are
 *     sandwiched in the central band (the classic layout).
 *   - 'leftRight': left/right rails span the full height, top/bottom (and the
 *     input bar) sit between them in the central column.
 * Only honoured by shells that opt in via setRailSpanSupported(true) and provide
 * #layout-left/right-dock-host elements (currently forge-ui).
 */
export type SpanningDocks = 'topBottom' | 'leftRight';

export interface LayoutState {
  /** Whether layout manager mode is enabled. */
  enabled: boolean;
  /** Which pair of edge docks spans the full extent (see SpanningDocks). */
  spanningDocks: SpanningDocks;
  /**
   * When true, the docked layout is frozen: dock/split resizing, splitting and
   * re-docking are disabled and docked windows hide their header controls
   * (close/popout/pin/lock/reset). Floating windows are unaffected — they can
   * still spawn, move, resize and close.
   */
  uiLocked: boolean;
  /** Which panels are managed by layout manager. */
  enabledPanels: {
    objectList: boolean;
  };
  /** Per-window state (identity, floating geometry, popup/popout metadata). */
  windows: Record<string, WindowRecord>;
  /** Structural layout tree per dock side (null = empty side). */
  dockTrees: Record<DockSide, SplitNode | null>;
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
  spanningDocks: 'topBottom',
  uiLocked: false,
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
    },
  },
  dockTrees: {
    left: null,
    top: null,
    bottom: null,
    right: {
      kind: 'split',
      id: 'root-right-default',
      dir: 'col',
      children: [
        { kind: 'leaf', id: 'leaf-map-default', windowIds: ['map'], activeId: 'map' },
        {
          kind: 'leaf',
          id: 'leaf-objectList-default',
          windowIds: ['objectList'],
          activeId: 'objectList',
        },
      ],
      sizes: [1, 1],
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

export function generateNodeId(): string {
  return `node-${_idBase()}-${Math.random().toString(36).slice(2, 8)}`;
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
