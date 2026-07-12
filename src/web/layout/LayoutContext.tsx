import {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BuiltInPanelState,
  DockSide,
  DragState,
  LayoutState,
  PanelId,
  PopupPanelDockState,
  WindowRecord,
} from './types';
import {
  isRailSpanSupported,
  loadLayoutState,
  resetLayoutState,
  saveLayoutStateDebounced,
} from './utils/layoutStorage';
import type { SpanningDocks } from './types';
import { windowManager, WindowManager } from './WindowManager';
import eventBus from '@modules/core/eventBus';

export interface LayoutContextValue {
  /** Singleton WindowManager — long-lived, stable identity. */
  manager: WindowManager;
  /** Reactive snapshot of the layout. Recomputed on every manager change. */
  layoutState: LayoutState;
  /** Bumps each time WindowManager.loadState fires. Hooks that maintain a
   *  manager registration (manager.open) include this in their deps so they
   *  re-issue open() after an external state replacement (Restore Default,
   *  device sync import). */
  loadVersion: number;
  /** Drag state — owned by the React layer (set by drag handlers in shells). */
  dragState: DragState | null;
  updateDragState: (s: DragState | null) => void;

  // Layout mode
  isLayoutMode: boolean;
  enableLayoutMode: () => void;
  disableLayoutMode: () => void;
  toggleLayoutMode: () => void;
  resetLayout: () => void;

  // Dock span orientation ("rails span everything" switch)
  /** Effective state: 'leftRight' only when the flag is set AND the active
   *  shell supports rail-span (provides the host divs). */
  railsVertical: boolean;
  setSpanningDocks: (v: SpanningDocks) => void;
  toggleSpanningDocks: () => void;

  // Popup dock state pass-throughs
  getPopupDockState: (id: string) => PopupPanelDockState | undefined;
  updatePopupDockState: (id: string, patch: Partial<PopupPanelDockState>) => void;

  // Built-in panel state pass-throughs
  getBuiltInPanelState: (id: string) => BuiltInPanelState | undefined;
  updateBuiltInPanelState: (id: string, patch: Partial<BuiltInPanelState>) => void;

  // Legacy lookups (kept for the popup hooks that still call them)
  findPanelDock: (id: PanelId) => DockSide | null;
  findFloatingPanel: (id: PanelId) => WindowRecord | null;
}

export const LayoutContext = createContext<LayoutContextValue | null>(null);

interface LayoutProviderProps {
  children: ReactNode;
  onLayoutModeChange?: (enabled: boolean) => void;
}

export function LayoutProvider({
  children,
  onLayoutModeChange,
}: LayoutProviderProps) {
  // Load persisted state into the manager once on mount.
  const initRef = useRef(false);
  if (!initRef.current) {
    initRef.current = true;
    windowManager.loadState(loadLayoutState());
  }

  // Render snapshot — bumped each time the manager fires a change.
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  const layoutState = useMemo(
    () => windowManager.serialize(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshotVersion]
  );
  const loadVersion = useMemo(
    () => windowManager.getLoadVersion(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshotVersion]
  );

  const [dragState, setDragState] = useState<DragState | null>(null);
  const isLayoutMode = layoutState.enabled;
  const railsVertical =
    layoutState.spanningDocks === 'leftRight' && isRailSpanSupported();

  // Subscribe to manager changes + debounce persistence.
  // Force a snapshot bump right after subscribing — child useEffects (e.g.
  // LayoutContent opening the map window) run before parent effects, so any
  // notifications they trigger arrive before we subscribe. Bumping once
  // immediately picks up that state.
  //
  // We deliberately don't emit 'layoutManagerStateChanged' on our own saves
  // (that would feed back into the reload listener below). The event is
  // reserved for *external* writes (uiSettings reset, device sync import).
  useEffect(() => {
    setSnapshotVersion(v => v + 1);
    const unsub = windowManager.subscribe(() => {
      setSnapshotVersion(v => v + 1);
      saveLayoutStateDebounced(windowManager.serialize());
    });
    return unsub;
  }, []);

  // Listen for external state changes (uiSettings reset, settings import).
  // These writers update localStorage directly and emit the event; we reload
  // our snapshot from storage so the UI picks up the change.
  useEffect(() => {
    const unsub = eventBus.on('layoutManagerStateChanged', () => {
      windowManager.loadState(loadLayoutState());
    });
    return unsub;
  }, []);

  // Body class management for the existing CSS to stay in effect.
  useEffect(() => {
    const body = document.body;
    body.classList.remove('layout-manager-enabled');
    body.classList.remove('layout-map-enabled');
    body.classList.remove('layout-objectlist-enabled');

    body.classList.remove('layout-rails-vertical');

    if (isLayoutMode) {
      body.classList.add('layout-manager-enabled');
      body.classList.add('layout-map-enabled');
      if (layoutState.enabledPanels.objectList) {
        body.classList.add('layout-objectlist-enabled');
      }
      if (railsVertical) {
        body.classList.add('layout-rails-vertical');
      }
    }
    onLayoutModeChange?.(isLayoutMode);
  }, [isLayoutMode, layoutState.enabledPanels.objectList, railsVertical, onLayoutModeChange]);

  // Drag body class.
  useEffect(() => {
    if (dragState) {
      document.body.classList.add('layout-dragging');
    } else {
      document.body.classList.remove('layout-dragging');
    }
    return () => {
      document.body.classList.remove('layout-dragging');
    };
  }, [dragState]);

  // ── Methods ────────────────────────────────────────────────────────────

  const enableLayoutMode = useCallback(() => windowManager.setEnabled(true), []);
  const disableLayoutMode = useCallback(() => windowManager.setEnabled(false), []);
  const toggleLayoutMode = useCallback(
    () => windowManager.setEnabled(!windowManager.isEnabled()),
    []
  );
  const resetLayout = useCallback(() => {
    const fresh = resetLayoutState();
    windowManager.loadState(fresh);
  }, []);

  const setSpanningDocks = useCallback(
    (v: SpanningDocks) => windowManager.setSpanningDocks(v),
    []
  );
  const toggleSpanningDocks = useCallback(
    () =>
      windowManager.setSpanningDocks(
        windowManager.getSpanningDocks() === 'leftRight' ? 'topBottom' : 'leftRight'
      ),
    []
  );

  const getPopupDockState = useCallback(
    (id: string) => windowManager.getPopupDockState(id),
    []
  );
  const updatePopupDockState = useCallback(
    (id: string, patch: Partial<PopupPanelDockState>) =>
      windowManager.updatePopupDockState(id, patch),
    []
  );

  const getBuiltInPanelState = useCallback(
    (id: string) => windowManager.getBuiltInPanelState(id),
    []
  );
  const updateBuiltInPanelState = useCallback(
    (id: string, patch: Partial<BuiltInPanelState>) =>
      windowManager.updateBuiltInPanelState(id, patch),
    []
  );

  const findPanelDock = useCallback(
    (id: PanelId) => windowManager.findPanelDock(id),
    []
  );
  const findFloatingPanel = useCallback(
    (id: PanelId) => windowManager.findFloatingPanel(id),
    []
  );

  const value = useMemo<LayoutContextValue>(
    () => ({
      manager: windowManager,
      layoutState,
      loadVersion,
      dragState,
      updateDragState: setDragState,
      isLayoutMode,
      enableLayoutMode,
      disableLayoutMode,
      toggleLayoutMode,
      resetLayout,
      railsVertical,
      setSpanningDocks,
      toggleSpanningDocks,
      getPopupDockState,
      updatePopupDockState,
      getBuiltInPanelState,
      updateBuiltInPanelState,
      findPanelDock,
      findFloatingPanel,
    }),
    [
      layoutState,
      loadVersion,
      dragState,
      isLayoutMode,
      enableLayoutMode,
      disableLayoutMode,
      toggleLayoutMode,
      resetLayout,
      railsVertical,
      setSpanningDocks,
      toggleSpanningDocks,
      getPopupDockState,
      updatePopupDockState,
      getBuiltInPanelState,
      updateBuiltInPanelState,
      findPanelDock,
      findFloatingPanel,
    ]
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}
