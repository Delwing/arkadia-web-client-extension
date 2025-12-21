import { createContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import {
  DockPosition,
  DragState,
  FloatingPanelState,
  LayoutState,
  PanelId,
  PanelState,
  PopupPanelDockState,
  BuiltInPanelState,
  PANEL_CONFIGS,
  MIN_DOCK_SIZE,
  MAX_DOCK_SIZE_RATIO,
} from './types';
import { loadLayoutState, saveLayoutStateDebounced, resetLayoutState } from './utils/layoutStorage';

export interface LayoutContextValue {
  layoutState: LayoutState;
  dragState: DragState | null;
  isLayoutMode: boolean;
  enableLayoutMode: () => void;
  disableLayoutMode: () => void;
  toggleLayoutMode: () => void;
  movePanel: (panelId: PanelId, targetDock: DockPosition, insertIndex?: number) => void;
  undockPanel: (panelId: PanelId, x: number, y: number) => void;
  dockFloatingPanel: (panelId: PanelId, targetDock: DockPosition, insertIndex?: number) => void;
  updateFloatingPanel: (panelId: PanelId, updates: Partial<FloatingPanelState>) => void;
  resizeDock: (dock: DockPosition, newSize: number) => void;
  resizePanel: (panelId: PanelId, newSize: number) => void;
  reorderPanels: (dock: DockPosition, fromIndex: number, toIndex: number) => void;
  updateDragState: (state: DragState | null) => void;
  resetLayout: () => void;
  findPanelDock: (panelId: PanelId) => DockPosition | null;
  findFloatingPanel: (panelId: PanelId) => FloatingPanelState | null;
  // Popup panel methods
  getPopupDockState: (popupId: string) => PopupPanelDockState | undefined;
  updatePopupDockState: (popupId: string, updates: Partial<PopupPanelDockState>) => void;
  dockPopup: (popupId: string, targetDock: DockPosition, insertIndex?: number) => void;
  undockPopup: (popupId: string) => void;
  removePopupFromDock: (popupId: string) => void;
  // Popup floating management
  addPopupFloating: (popupId: string, state: FloatingPanelState) => void;
  removePopupFloating: (popupId: string) => void;
  // Built-in panel methods
  getBuiltInPanelState: (panelId: string) => BuiltInPanelState | undefined;
  updateBuiltInPanelState: (panelId: string, updates: Partial<BuiltInPanelState>) => void;
}

export const LayoutContext = createContext<LayoutContextValue | null>(null);

interface LayoutProviderProps {
  children: ReactNode;
  onLayoutModeChange?: (enabled: boolean) => void;
}

export function LayoutProvider({ children, onLayoutModeChange }: LayoutProviderProps) {
  const [layoutState, setLayoutState] = useState<LayoutState>(() => loadLayoutState());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const isLayoutMode = layoutState.enabled;
  const isInternalUpdate = useRef(false);

  const saveStateRef = useRef(layoutState);
  saveStateRef.current = layoutState;

  // Listen for storage changes (from UI settings toggle)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'layoutManagerState' && !isInternalUpdate.current) {
        const newState = loadLayoutState();
        setLayoutState(newState);
      }
    };

    // Also listen for custom events for same-tab updates
    const handleCustomStorageChange = () => {
      if (!isInternalUpdate.current) {
        const newState = loadLayoutState();
        setLayoutState(newState);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('layoutManagerStateChanged', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('layoutManagerStateChanged', handleCustomStorageChange);
    };
  }, []);

  useEffect(() => {
    isInternalUpdate.current = true;
    saveLayoutStateDebounced(layoutState);
    // Dispatch custom event for same-tab listeners
    window.dispatchEvent(new CustomEvent('layoutManagerStateChanged'));
    requestAnimationFrame(() => {
      isInternalUpdate.current = false;
    });
  }, [layoutState]);

  useEffect(() => {
    // Remove all layout-related classes first
    document.body.classList.remove('layout-manager-enabled');
    document.body.classList.remove('layout-map-enabled');
    document.body.classList.remove('layout-objectlist-enabled');

    if (isLayoutMode) {
      document.body.classList.add('layout-manager-enabled');
      // Map is always managed when layout manager is enabled
      document.body.classList.add('layout-map-enabled');
      // Object list can be toggled independently
      if (layoutState.enabledPanels.objectList) {
        document.body.classList.add('layout-objectlist-enabled');
      }
    }
    onLayoutModeChange?.(isLayoutMode);
  }, [isLayoutMode, layoutState.enabledPanels, onLayoutModeChange]);

  // Handle window resize - clamp floating panels to fit within viewport
  useEffect(() => {
    if (!isLayoutMode) return;

    const handleResize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 16;

      setLayoutState((prev) => {
        let anyChanged = false;
        const newFloatingPanels = prev.floatingPanels.map((panel) => {
          let { x, y, width, height } = panel;
          let panelChanged = false;

          // Ensure panel fits within viewport width
          if (width > viewportWidth - margin * 2) {
            width = viewportWidth - margin * 2;
            panelChanged = true;
          }

          // Ensure panel fits within viewport height
          if (height !== undefined && height > viewportHeight - margin * 2) {
            height = viewportHeight - margin * 2;
            panelChanged = true;
          }

          // Clamp position to keep panel visible
          const maxX = viewportWidth - width - margin;
          const maxY = viewportHeight - (height ?? 100) - margin;

          if (x > maxX) {
            x = Math.max(margin, maxX);
            panelChanged = true;
          }
          if (x < margin) {
            x = margin;
            panelChanged = true;
          }
          if (y > maxY) {
            y = Math.max(margin, maxY);
            panelChanged = true;
          }
          if (y < margin) {
            y = margin;
            panelChanged = true;
          }

          if (panelChanged) {
            anyChanged = true;
            return { ...panel, x, y, width, ...(height !== undefined && { height }) };
          }
          return panel;
        });

        if (anyChanged) {
          return { ...prev, floatingPanels: newFloatingPanels };
        }
        return prev;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isLayoutMode]);

  const enableLayoutMode = useCallback(() => {
    setLayoutState((prev) => ({ ...prev, enabled: true }));
  }, []);

  const disableLayoutMode = useCallback(() => {
    setLayoutState((prev) => ({ ...prev, enabled: false }));
  }, []);

  const toggleLayoutMode = useCallback(() => {
    setLayoutState((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const findPanelDock = useCallback(
    (panelId: PanelId): DockPosition | null => {
      const { docks } = layoutState;
      if (docks.left.panels.some((p) => p.id === panelId)) return 'LEFT';
      if (docks.top.panels.some((p) => p.id === panelId)) return 'TOP';
      if (docks.right.panels.some((p) => p.id === panelId)) return 'RIGHT';
      return null;
    },
    [layoutState]
  );

  const movePanel = useCallback(
    (panelId: PanelId, targetDock: DockPosition, insertIndex = 0) => {
      setLayoutState((prev) => {
        const newDocks = { ...prev.docks };
        let movedPanel: PanelState | null = null;

        // Remove panel from all docks
        for (const key of ['left', 'top', 'right'] as const) {
          const dock = newDocks[key];
          const idx = dock.panels.findIndex((p) => p.id === panelId);
          if (idx !== -1) {
            movedPanel = dock.panels[idx];
            newDocks[key] = {
              ...dock,
              panels: dock.panels.filter((p) => p.id !== panelId),
            };
          }
        }

        // Also remove from floating panels
        const newFloatingPanels = prev.floatingPanels.filter((p) => p.id !== panelId);

        if (!movedPanel) {
          // Panel not found, create new one
          movedPanel = { id: panelId, order: insertIndex, size: 100 };
        }

        // Add panel to target dock
        const targetKey = targetDock.toLowerCase() as 'left' | 'top' | 'right';
        const targetDockState = newDocks[targetKey];
        const newPanels = [...targetDockState.panels];
        newPanels.splice(insertIndex, 0, { ...movedPanel, order: insertIndex });

        // Recalculate sizes evenly
        const panelCount = newPanels.length;
        const evenSize = 100 / panelCount;
        newPanels.forEach((p, i) => {
          p.order = i;
          p.size = evenSize;
        });

        newDocks[targetKey] = { ...targetDockState, panels: newPanels };

        return { ...prev, docks: newDocks, floatingPanels: newFloatingPanels };
      });
    },
    []
  );

  const undockPanel = useCallback((panelId: PanelId, x: number, y: number) => {
    setLayoutState((prev) => {
      const newDocks = { ...prev.docks };
      let sourceDockKey: 'left' | 'top' | 'right' | null = null;
      let sourceDockSize = 0;
      let panelSizePercent = 100;

      // Remove panel from all docks and capture source dock info
      for (const key of ['left', 'top', 'right'] as const) {
        const dock = newDocks[key];
        const idx = dock.panels.findIndex((p) => p.id === panelId);
        if (idx !== -1) {
          sourceDockKey = key;
          sourceDockSize = dock.size;
          panelSizePercent = dock.panels[idx].size;

          const remainingPanels = dock.panels.filter((p) => p.id !== panelId);
          // Recalculate sizes for remaining panels
          if (remainingPanels.length > 0) {
            const evenSize = 100 / remainingPanels.length;
            remainingPanels.forEach((p, i) => {
              p.order = i;
              p.size = evenSize;
            });
          }
          newDocks[key] = { ...dock, panels: remainingPanels };
        }
      }

      // Calculate floating panel size based on source dock
      let width: number;
      let height: number;
      const config = PANEL_CONFIGS[panelId];
      const minWidth = config?.minWidth ?? 150;
      const minHeight = config?.minHeight ?? 100;

      if (sourceDockKey === 'top') {
        // TOP dock: width is percentage of content area, height is dock size
        const contentArea = document.getElementById('content-area');
        const contentWidth = contentArea?.offsetWidth ?? 800;
        width = Math.max(minWidth, (contentWidth * panelSizePercent) / 100);
        height = Math.max(minHeight, sourceDockSize);
      } else if (sourceDockKey) {
        // LEFT/RIGHT dock: width is dock size, height is percentage of available height
        const contentArea = document.getElementById('content-area');
        const topDockHeight = prev.docks.top.panels.length > 0 ? prev.docks.top.size : 0;
        const availableHeight = (contentArea?.offsetHeight ?? 600) - topDockHeight;
        width = Math.max(minWidth, sourceDockSize);
        height = Math.max(minHeight, (availableHeight * panelSizePercent) / 100);
      } else {
        // Fallback
        width = Math.max(minWidth, 300);
        height = Math.max(minHeight, 200);
      }

      // Create floating panel centered on cursor
      const floatingPanel: FloatingPanelState = {
        id: panelId,
        x: Math.max(0, x - width / 2),
        y: Math.max(0, y - 20),
        width,
        height,
      };

      // Remove existing floating panel with same id and add new one
      const newFloatingPanels = prev.floatingPanels.filter((p) => p.id !== panelId);
      newFloatingPanels.push(floatingPanel);

      return { ...prev, docks: newDocks, floatingPanels: newFloatingPanels };
    });
  }, []);

  const dockFloatingPanel = useCallback(
    (panelId: PanelId, targetDock: DockPosition, insertIndex = 0) => {
      // Just use movePanel - it handles floating panels too
      movePanel(panelId, targetDock, insertIndex);
    },
    [movePanel]
  );

  const updateFloatingPanel = useCallback(
    (panelId: PanelId, updates: Partial<FloatingPanelState>) => {
      setLayoutState((prev) => {
        const newFloatingPanels = prev.floatingPanels.map((p) =>
          p.id === panelId ? { ...p, ...updates } : p
        );

        // If this is a popup panel, mark it as user-modified
        const isPopup = panelId.startsWith('popup:');
        if (isPopup) {
          return {
            ...prev,
            floatingPanels: newFloatingPanels,
            popupPanels: {
              ...prev.popupPanels,
              [panelId]: {
                ...prev.popupPanels[panelId],
                userModifiedPosition: true,
              },
            },
          };
        }

        return { ...prev, floatingPanels: newFloatingPanels };
      });
    },
    []
  );

  const findFloatingPanel = useCallback(
    (panelId: PanelId): FloatingPanelState | null => {
      return layoutState.floatingPanels.find((p) => p.id === panelId) ?? null;
    },
    [layoutState]
  );

  const resizeDock = useCallback((dock: DockPosition, newSize: number) => {
    const maxSize =
      dock === 'TOP'
        ? window.innerHeight * MAX_DOCK_SIZE_RATIO
        : window.innerWidth * MAX_DOCK_SIZE_RATIO;
    const clampedSize = Math.max(MIN_DOCK_SIZE, Math.min(maxSize, newSize));

    setLayoutState((prev) => {
      const dockKey = dock.toLowerCase() as 'left' | 'top' | 'right';
      return {
        ...prev,
        docks: {
          ...prev.docks,
          [dockKey]: { ...prev.docks[dockKey], size: clampedSize },
        },
      };
    });
  }, []);

  const resizePanel = useCallback((panelId: PanelId, newSize: number) => {
    setLayoutState((prev) => {
      const newDocks = { ...prev.docks };

      for (const key of ['left', 'top', 'right'] as const) {
        const dock = newDocks[key];
        const idx = dock.panels.findIndex((p) => p.id === panelId);
        if (idx !== -1) {
          const newPanels = [...dock.panels];
          const clampedSize = Math.max(10, Math.min(90, newSize));
          const delta = clampedSize - newPanels[idx].size;

          if (idx < newPanels.length - 1) {
            // Take from next panel
            newPanels[idx] = { ...newPanels[idx], size: clampedSize };
            newPanels[idx + 1] = {
              ...newPanels[idx + 1],
              size: Math.max(10, newPanels[idx + 1].size - delta),
            };
          } else if (idx > 0) {
            // Take from previous panel
            newPanels[idx] = { ...newPanels[idx], size: clampedSize };
            newPanels[idx - 1] = {
              ...newPanels[idx - 1],
              size: Math.max(10, newPanels[idx - 1].size - delta),
            };
          }

          newDocks[key] = { ...dock, panels: newPanels };
          break;
        }
      }

      return { ...prev, docks: newDocks };
    });
  }, []);

  const reorderPanels = useCallback(
    (dock: DockPosition, fromIndex: number, toIndex: number) => {
      setLayoutState((prev) => {
        const dockKey = dock.toLowerCase() as 'left' | 'top' | 'right';
        const dockState = prev.docks[dockKey];
        const newPanels = [...dockState.panels];

        const [moved] = newPanels.splice(fromIndex, 1);
        newPanels.splice(toIndex, 0, moved);

        newPanels.forEach((p, i) => {
          p.order = i;
        });

        return {
          ...prev,
          docks: {
            ...prev.docks,
            [dockKey]: { ...dockState, panels: newPanels },
          },
        };
      });
    },
    []
  );

  const updateDragState = useCallback((state: DragState | null) => {
    setDragState(state);
  }, []);

  const resetLayout = useCallback(() => {
    const newState = resetLayoutState();
    setLayoutState(newState);
  }, []);

  // Popup panel management methods
  const getPopupDockState = useCallback(
    (popupId: string): PopupPanelDockState | undefined => {
      return layoutState.popupPanels[popupId];
    },
    [layoutState.popupPanels]
  );

  const updatePopupDockState = useCallback(
    (popupId: string, updates: Partial<PopupPanelDockState>) => {
      setLayoutState((prev) => ({
        ...prev,
        popupPanels: {
          ...prev.popupPanels,
          [popupId]: {
            ...prev.popupPanels[popupId],
            ...updates,
          },
        },
      }));
    },
    []
  );

  const dockPopup = useCallback(
    (popupId: string, targetDock: DockPosition, insertIndex = 0) => {
      setLayoutState((prev) => {
        const newDocks = { ...prev.docks };
        const targetKey = targetDock.toLowerCase() as 'left' | 'top' | 'right';
        const targetDockState = newDocks[targetKey];

        // Check if popup is already in any dock and remove it
        for (const key of ['left', 'top', 'right'] as const) {
          const dock = newDocks[key];
          const idx = dock.panels.findIndex((p) => p.id === popupId);
          if (idx !== -1) {
            newDocks[key] = {
              ...dock,
              panels: dock.panels.filter((p) => p.id !== popupId),
            };
          }
        }

        // Add panel to target dock
        const newPanels = [...newDocks[targetKey].panels];
        newPanels.splice(insertIndex, 0, { id: popupId, order: insertIndex, size: 100 });

        // Recalculate sizes evenly
        const panelCount = newPanels.length;
        const evenSize = 100 / panelCount;
        newPanels.forEach((p, i) => {
          p.order = i;
          p.size = evenSize;
        });

        newDocks[targetKey] = { ...targetDockState, panels: newPanels };

        // Remove from floating panels if present
        const newFloatingPanels = prev.floatingPanels.filter((p) => p.id !== popupId);

        // Update popup state
        const popupState = prev.popupPanels[popupId] || { isDocked: false };

        return {
          ...prev,
          docks: newDocks,
          floatingPanels: newFloatingPanels,
          popupPanels: {
            ...prev.popupPanels,
            [popupId]: {
              ...popupState,
              isDocked: true,
              dockPosition: targetDock,
              dockOrder: insertIndex,
              dockSize: evenSize,
            },
          },
        };
      });
    },
    []
  );

  const undockPopup = useCallback((popupId: string) => {
    setLayoutState((prev) => {
      const newDocks = { ...prev.docks };
      let sourceDockKey: 'left' | 'top' | 'right' | null = null;
      let sourceDockSize = 0;
      let panelSizePercent = 100;

      // Remove panel from all docks and capture source dock info
      for (const key of ['left', 'top', 'right'] as const) {
        const dock = newDocks[key];
        const idx = dock.panels.findIndex((p) => p.id === popupId);
        if (idx !== -1) {
          sourceDockKey = key;
          sourceDockSize = dock.size;
          panelSizePercent = dock.panels[idx].size;

          const remainingPanels = dock.panels.filter((p) => p.id !== popupId);
          // Recalculate sizes for remaining panels
          if (remainingPanels.length > 0) {
            const evenSize = 100 / remainingPanels.length;
            remainingPanels.forEach((p, i) => {
              p.order = i;
              p.size = evenSize;
            });
          }
          newDocks[key] = { ...dock, panels: remainingPanels };
        }
      }

      // Get previous floating state or calculate new one
      const popupState = prev.popupPanels[popupId];
      const lastFloating = popupState?.floatingState;

      let floatingState: { x: number; y: number; width: number; height: number };

      if (lastFloating) {
        floatingState = lastFloating;
      } else {
        // Calculate based on source dock
        const contentArea = document.getElementById('content-area');
        let width: number;
        let height: number;

        if (sourceDockKey === 'top') {
          const contentWidth = contentArea?.offsetWidth ?? 800;
          width = Math.max(300, (contentWidth * panelSizePercent) / 100);
          height = Math.max(200, sourceDockSize);
        } else if (sourceDockKey) {
          const topDockHeight = prev.docks.top.panels.length > 0 ? prev.docks.top.size : 0;
          const availableHeight = (contentArea?.offsetHeight ?? 600) - topDockHeight;
          width = Math.max(300, sourceDockSize);
          height = Math.max(200, (availableHeight * panelSizePercent) / 100);
        } else {
          width = 350;
          height = 300;
        }

        // Center on screen
        floatingState = {
          x: Math.max(16, (window.innerWidth - width) / 2),
          y: Math.max(16, (window.innerHeight - height) / 2),
          width,
          height,
        };
      }

      return {
        ...prev,
        docks: newDocks,
        popupPanels: {
          ...prev.popupPanels,
          [popupId]: {
            ...popupState,
            isDocked: false,
            floatingState,
            userModifiedPosition: true,
          },
        },
      };
    });
  }, []);

  const removePopupFromDock = useCallback((popupId: string) => {
    setLayoutState((prev) => {
      const newDocks = { ...prev.docks };

      // Remove panel from all docks
      for (const key of ['left', 'top', 'right'] as const) {
        const dock = newDocks[key];
        const idx = dock.panels.findIndex((p) => p.id === popupId);
        if (idx !== -1) {
          const remainingPanels = dock.panels.filter((p) => p.id !== popupId);
          // Recalculate sizes for remaining panels
          if (remainingPanels.length > 0) {
            const evenSize = 100 / remainingPanels.length;
            remainingPanels.forEach((p, i) => {
              p.order = i;
              p.size = evenSize;
            });
          }
          newDocks[key] = { ...dock, panels: remainingPanels };
        }
      }

      // Remove from floating panels
      const newFloatingPanels = prev.floatingPanels.filter((p) => p.id !== popupId);

      return {
        ...prev,
        docks: newDocks,
        floatingPanels: newFloatingPanels,
      };
    });
  }, []);

  const addPopupFloating = useCallback((popupId: string, state: FloatingPanelState) => {
    setLayoutState((prev) => {
      // Don't add if already exists
      if (prev.floatingPanels.some((p) => p.id === popupId)) {
        return prev;
      }
      return {
        ...prev,
        floatingPanels: [...prev.floatingPanels, state],
      };
    });
  }, []);

  const removePopupFloating = useCallback((popupId: string) => {
    setLayoutState((prev) => ({
      ...prev,
      floatingPanels: prev.floatingPanels.filter((p) => p.id !== popupId),
    }));
  }, []);

  // Built-in panel methods
  const getBuiltInPanelState = useCallback(
    (panelId: string): BuiltInPanelState | undefined => {
      return layoutState.builtInPanels?.[panelId];
    },
    [layoutState.builtInPanels]
  );

  const updateBuiltInPanelState = useCallback(
    (panelId: string, updates: Partial<BuiltInPanelState>) => {
      setLayoutState((prev) => ({
        ...prev,
        builtInPanels: {
          ...prev.builtInPanels,
          [panelId]: {
            ...prev.builtInPanels?.[panelId],
            ...updates,
          },
        },
      }));
    },
    []
  );

  const value = useMemo<LayoutContextValue>(
    () => ({
      layoutState,
      dragState,
      isLayoutMode,
      enableLayoutMode,
      disableLayoutMode,
      toggleLayoutMode,
      movePanel,
      undockPanel,
      dockFloatingPanel,
      updateFloatingPanel,
      resizeDock,
      resizePanel,
      reorderPanels,
      updateDragState,
      resetLayout,
      findPanelDock,
      findFloatingPanel,
      // Popup panel methods
      getPopupDockState,
      updatePopupDockState,
      dockPopup,
      undockPopup,
      removePopupFromDock,
      // Popup floating management
      addPopupFloating,
      removePopupFloating,
      // Built-in panel methods
      getBuiltInPanelState,
      updateBuiltInPanelState,
    }),
    [
      layoutState,
      dragState,
      isLayoutMode,
      enableLayoutMode,
      disableLayoutMode,
      toggleLayoutMode,
      movePanel,
      undockPanel,
      dockFloatingPanel,
      updateFloatingPanel,
      resizeDock,
      resizePanel,
      reorderPanels,
      updateDragState,
      resetLayout,
      findPanelDock,
      findFloatingPanel,
      // Popup panel methods
      getPopupDockState,
      updatePopupDockState,
      dockPopup,
      undockPopup,
      removePopupFromDock,
      // Popup floating management
      addPopupFloating,
      removePopupFloating,
      // Built-in panel methods
      getBuiltInPanelState,
      updateBuiltInPanelState,
    ]
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}
