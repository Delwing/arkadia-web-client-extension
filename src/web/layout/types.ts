export type DockPosition = 'LEFT' | 'TOP' | 'RIGHT';

export type PanelId = 'map' | 'objectList' | string;

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
  height: number;
}

export interface DockState {
  /** Size of the dock zone (LEFT/RIGHT: width in px, TOP: height in px) */
  size: number;
  panels: PanelState[];
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
};

export const MIN_DOCK_SIZE = 100;
export const MAX_DOCK_SIZE_RATIO = 0.4; // Max 40% of viewport
