import { createContext, useCallback, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import {
  DockPosition,
  DockSlot,
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
  generateSlotId,
} from './types';
import { loadLayoutState, saveLayoutStateDebounced, resetLayoutState } from './utils/layoutStorage';

export interface LayoutContextValue {
  layoutState: LayoutState;
  dragState: DragState | null;
  isLayoutMode: boolean;
  enableLayoutMode: () => void;
  disableLayoutMode: () => void;
  toggleLayoutMode: () => void;
  /** Move panel to a new slot in target dock */
  movePanel: (panelId: PanelId, targetDock: DockPosition, insertIndex?: number) => void;
  /** Move panel into an existing slot (stacking) */
  movePanelToSlot: (panelId: PanelId, targetDock: DockPosition, slotId: string, insertPositionInSlot?: number) => void;
  undockPanel: (panelId: PanelId, x: number, y: number) => void;
  dockFloatingPanel: (panelId: PanelId, targetDock: DockPosition, insertIndex?: number) => void;
  /** Dock floating panel into an existing slot (stacking) */
  dockFloatingPanelToSlot: (panelId: PanelId, targetDock: DockPosition, slotId: string, insertPositionInSlot?: number) => void;
  updateFloatingPanel: (panelId: PanelId, updates: Partial<FloatingPanelState>) => void;
  resizeDock: (dock: DockPosition, newSize: number) => void;
  /** Resize a slot within a dock */
  resizeSlot: (slotId: string, newSize: number) => void;
  /** Resize a panel within a slot */
  resizePanelInSlot: (panelId: PanelId, newSize: number) => void;
  reorderPanels: (dock: DockPosition, fromIndex: number, toIndex: number) => void;
  updateDragState: (state: DragState | null) => void;
  resetLayout: () => void;
  findPanelDock: (panelId: PanelId) => DockPosition | null;
  /** Find which slot a panel is in */
  findPanelSlot: (panelId: PanelId) => { dock: DockPosition; slot: DockSlot } | null;
  findFloatingPanel: (panelId: PanelId) => FloatingPanelState | null;
  // Popup panel methods
  getPopupDockState: (popupId: string) => PopupPanelDockState | undefined;
  updatePopupDockState: (popupId: string, updates: Partial<PopupPanelDockState>) => void;
  /** Dock popup to a new slot */
  dockPopup: (popupId: string, targetDock: DockPosition, insertIndex?: number) => void;
  /** Dock popup into an existing slot (stacking) */
  dockPopupToSlot: (popupId: string, targetDock: DockPosition, slotId: string, insertPositionInSlot?: number) => void;
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
      for (const slot of docks.left.slots) {
        if (slot.panels.some((p) => p.id === panelId)) return 'LEFT';
      }
      for (const slot of docks.top.slots) {
        if (slot.panels.some((p) => p.id === panelId)) return 'TOP';
      }
      for (const slot of docks.right.slots) {
        if (slot.panels.some((p) => p.id === panelId)) return 'RIGHT';
      }
      return null;
    },
    [layoutState]
  );

  const findPanelSlot = useCallback(
    (panelId: PanelId): { dock: DockPosition; slot: DockSlot } | null => {
      const { docks } = layoutState;
      const dockKeys: Array<{ key: 'left' | 'top' | 'right'; position: DockPosition }> = [
        { key: 'left', position: 'LEFT' },
        { key: 'top', position: 'TOP' },
        { key: 'right', position: 'RIGHT' },
      ];
      for (const { key, position } of dockKeys) {
        for (const slot of docks[key].slots) {
          if (slot.panels.some((p) => p.id === panelId)) {
            return { dock: position, slot };
          }
        }
      }
      return null;
    },
    [layoutState]
  );

  /**
   * Helper to remove a panel from all docks.
   * Returns the removed panel state and cleans up empty slots.
   */
  const removePanelFromDocks = useCallback(
    (docks: LayoutState['docks'], panelId: PanelId): { docks: LayoutState['docks']; removedPanel: PanelState | null } => {
      const newDocks = { ...docks };
      let removedPanel: PanelState | null = null;

      for (const key of ['left', 'top', 'right'] as const) {
        const dock = newDocks[key];
        const newSlots: DockSlot[] = [];

        for (const slot of dock.slots) {
          const panelIdx = slot.panels.findIndex((p) => p.id === panelId);
          if (panelIdx !== -1) {
            removedPanel = slot.panels[panelIdx];
            const remainingPanels = slot.panels.filter((p) => p.id !== panelId);
            if (remainingPanels.length > 0) {
              // Recalculate panel sizes within slot
              const evenSize = 100 / remainingPanels.length;
              remainingPanels.forEach((p, i) => {
                p.order = i;
                p.size = evenSize;
              });
              newSlots.push({ ...slot, panels: remainingPanels });
            }
            // If slot is empty, don't add it (effectively removing it)
          } else {
            newSlots.push(slot);
          }
        }

        // Recalculate slot sizes if any were removed
        if (newSlots.length !== dock.slots.length && newSlots.length > 0) {
          const evenSize = 100 / newSlots.length;
          newSlots.forEach((s) => {
            s.size = evenSize;
          });
        }

        newDocks[key] = { ...dock, slots: newSlots };
      }

      return { docks: newDocks, removedPanel };
    },
    []
  );

  const movePanel = useCallback(
    (panelId: PanelId, targetDock: DockPosition, insertIndex = 0) => {
      setLayoutState((prev) => {
        // Remove panel from all docks
        const { docks: newDocks, removedPanel } = removePanelFromDocks(prev.docks, panelId);

        // Also remove from floating panels
        const newFloatingPanels = prev.floatingPanels.filter((p) => p.id !== panelId);

        // Create the panel state
        const panelState: PanelState = removedPanel || { id: panelId, order: 0, size: 100 };

        // Add panel as a new slot in target dock
        const targetKey = targetDock.toLowerCase() as 'left' | 'top' | 'right';
        const targetDockState = newDocks[targetKey];
        const newSlots = [...targetDockState.slots];

        // Create new slot with this panel
        const newSlot: DockSlot = {
          id: generateSlotId(),
          panels: [{ ...panelState, order: 0, size: 100 }],
          size: 100,
        };

        newSlots.splice(insertIndex, 0, newSlot);

        // Recalculate slot sizes evenly
        const slotCount = newSlots.length;
        const evenSize = 100 / slotCount;
        newSlots.forEach((s) => {
          s.size = evenSize;
        });

        newDocks[targetKey] = { ...targetDockState, slots: newSlots };

        return { ...prev, docks: newDocks, floatingPanels: newFloatingPanels };
      });
    },
    [removePanelFromDocks]
  );

  const movePanelToSlot = useCallback(
    (panelId: PanelId, targetDock: DockPosition, slotId: string, insertPositionInSlot = 0) => {
      setLayoutState((prev) => {
        // Remove panel from all docks
        const { docks: newDocks, removedPanel } = removePanelFromDocks(prev.docks, panelId);

        // Also remove from floating panels
        const newFloatingPanels = prev.floatingPanels.filter((p) => p.id !== panelId);

        // Create the panel state
        const panelState: PanelState = removedPanel || { id: panelId, order: 0, size: 100 };

        // Find and update the target slot
        const targetKey = targetDock.toLowerCase() as 'left' | 'top' | 'right';
        const targetDockState = newDocks[targetKey];
        const newSlots = targetDockState.slots.map((slot) => {
          if (slot.id === slotId) {
            const newPanels = [...slot.panels];
            newPanels.splice(insertPositionInSlot, 0, { ...panelState, order: insertPositionInSlot, size: 100 });

            // Recalculate panel sizes within slot
            const evenSize = 100 / newPanels.length;
            newPanels.forEach((p, i) => {
              p.order = i;
              p.size = evenSize;
            });

            return { ...slot, panels: newPanels };
          }
          return slot;
        });

        newDocks[targetKey] = { ...targetDockState, slots: newSlots };

        return { ...prev, docks: newDocks, floatingPanels: newFloatingPanels };
      });
    },
    [removePanelFromDocks]
  );

  const undockPanel = useCallback((panelId: PanelId, x: number, y: number) => {
    setLayoutState((prev) => {
      let sourceDockKey: 'left' | 'top' | 'right' | null = null;
      let sourceDockSize = 0;
      let slotSizePercent = 100;
      let panelSizePercent = 100;

      // Find source dock and slot info before removing
      for (const key of ['left', 'top', 'right'] as const) {
        const dock = prev.docks[key];
        for (const slot of dock.slots) {
          const panelIdx = slot.panels.findIndex((p) => p.id === panelId);
          if (panelIdx !== -1) {
            sourceDockKey = key;
            sourceDockSize = dock.size;
            slotSizePercent = slot.size;
            panelSizePercent = slot.panels[panelIdx].size;
            break;
          }
        }
        if (sourceDockKey) break;
      }

      // Remove panel from all docks
      const { docks: newDocks } = removePanelFromDocks(prev.docks, panelId);

      // Calculate floating panel size based on source dock
      let width: number;
      let height: number;
      const config = PANEL_CONFIGS[panelId];
      const minWidth = config?.minWidth ?? 150;
      const minHeight = config?.minHeight ?? 100;

      if (sourceDockKey === 'top') {
        // TOP dock: slot width is percentage of content area, panel height is percentage of dock height
        const contentArea = document.getElementById('content-area');
        const contentWidth = contentArea?.offsetWidth ?? 800;
        width = Math.max(minWidth, (contentWidth * slotSizePercent) / 100);
        height = Math.max(minHeight, (sourceDockSize * panelSizePercent) / 100);
      } else if (sourceDockKey) {
        // LEFT/RIGHT dock: slot height is percentage of available height, panel width is percentage of dock width
        const contentArea = document.getElementById('content-area');
        const topDockHeight = prev.docks.top.slots.length > 0 ? prev.docks.top.size : 0;
        const availableHeight = (contentArea?.offsetHeight ?? 600) - topDockHeight;
        width = Math.max(minWidth, (sourceDockSize * panelSizePercent) / 100);
        height = Math.max(minHeight, (availableHeight * slotSizePercent) / 100);
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
  }, [removePanelFromDocks]);

  const dockFloatingPanel = useCallback(
    (panelId: PanelId, targetDock: DockPosition, insertIndex = 0) => {
      // Just use movePanel - it handles floating panels too
      movePanel(panelId, targetDock, insertIndex);
    },
    [movePanel]
  );

  const dockFloatingPanelToSlot = useCallback(
    (panelId: PanelId, targetDock: DockPosition, slotId: string, insertPositionInSlot = 0) => {
      // Just use movePanelToSlot - it handles floating panels too
      movePanelToSlot(panelId, targetDock, slotId, insertPositionInSlot);
    },
    [movePanelToSlot]
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

  /** Resize a slot within a dock */
  const resizeSlot = useCallback((slotId: string, newSize: number) => {
    setLayoutState((prev) => {
      const newDocks = { ...prev.docks };

      for (const key of ['left', 'top', 'right'] as const) {
        const dock = newDocks[key];
        const slotIdx = dock.slots.findIndex((s) => s.id === slotId);
        if (slotIdx !== -1) {
          const newSlots = [...dock.slots];
          const clampedSize = Math.max(10, Math.min(90, newSize));
          const delta = clampedSize - newSlots[slotIdx].size;

          if (slotIdx < newSlots.length - 1) {
            // Take from next slot
            newSlots[slotIdx] = { ...newSlots[slotIdx], size: clampedSize };
            newSlots[slotIdx + 1] = {
              ...newSlots[slotIdx + 1],
              size: Math.max(10, newSlots[slotIdx + 1].size - delta),
            };
          } else if (slotIdx > 0) {
            // Take from previous slot
            newSlots[slotIdx] = { ...newSlots[slotIdx], size: clampedSize };
            newSlots[slotIdx - 1] = {
              ...newSlots[slotIdx - 1],
              size: Math.max(10, newSlots[slotIdx - 1].size - delta),
            };
          }

          newDocks[key] = { ...dock, slots: newSlots };
          break;
        }
      }

      return { ...prev, docks: newDocks };
    });
  }, []);

  /** Resize a panel within its slot */
  const resizePanelInSlot = useCallback((panelId: PanelId, newSize: number) => {
    setLayoutState((prev) => {
      const newDocks = { ...prev.docks };

      for (const key of ['left', 'top', 'right'] as const) {
        const dock = newDocks[key];
        let found = false;

        const newSlots = dock.slots.map((slot) => {
          const panelIdx = slot.panels.findIndex((p) => p.id === panelId);
          if (panelIdx !== -1) {
            found = true;
            const newPanels = [...slot.panels];
            const clampedSize = Math.max(10, Math.min(90, newSize));
            const delta = clampedSize - newPanels[panelIdx].size;

            if (panelIdx < newPanels.length - 1) {
              // Take from next panel
              newPanels[panelIdx] = { ...newPanels[panelIdx], size: clampedSize };
              newPanels[panelIdx + 1] = {
                ...newPanels[panelIdx + 1],
                size: Math.max(10, newPanels[panelIdx + 1].size - delta),
              };
            } else if (panelIdx > 0) {
              // Take from previous panel
              newPanels[panelIdx] = { ...newPanels[panelIdx], size: clampedSize };
              newPanels[panelIdx - 1] = {
                ...newPanels[panelIdx - 1],
                size: Math.max(10, newPanels[panelIdx - 1].size - delta),
              };
            }

            return { ...slot, panels: newPanels };
          }
          return slot;
        });

        if (found) {
          newDocks[key] = { ...dock, slots: newSlots };
          break;
        }
      }

      return { ...prev, docks: newDocks };
    });
  }, []);

  const reorderPanels = useCallback(
    (dock: DockPosition, fromIndex: number, toIndex: number) => {
      // This reorders slots within a dock
      setLayoutState((prev) => {
        const dockKey = dock.toLowerCase() as 'left' | 'top' | 'right';
        const dockState = prev.docks[dockKey];
        const newSlots = [...dockState.slots];

        const [moved] = newSlots.splice(fromIndex, 1);
        newSlots.splice(toIndex, 0, moved);

        return {
          ...prev,
          docks: {
            ...prev.docks,
            [dockKey]: { ...dockState, slots: newSlots },
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
        // Remove popup from all docks first
        const { docks: newDocks } = removePanelFromDocks(prev.docks, popupId);

        const targetKey = targetDock.toLowerCase() as 'left' | 'top' | 'right';
        const targetDockState = newDocks[targetKey];

        // Create new slot with this popup
        const newSlot: DockSlot = {
          id: generateSlotId(),
          panels: [{ id: popupId, order: 0, size: 100 }],
          size: 100,
        };

        const newSlots = [...targetDockState.slots];
        newSlots.splice(insertIndex, 0, newSlot);

        // Recalculate slot sizes evenly
        const slotCount = newSlots.length;
        const evenSize = 100 / slotCount;
        newSlots.forEach((s) => {
          s.size = evenSize;
        });

        newDocks[targetKey] = { ...targetDockState, slots: newSlots };

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
    [removePanelFromDocks]
  );

  const dockPopupToSlot = useCallback(
    (popupId: string, targetDock: DockPosition, slotId: string, insertPositionInSlot = 0) => {
      setLayoutState((prev) => {
        // Remove popup from all docks first
        const { docks: newDocks } = removePanelFromDocks(prev.docks, popupId);

        const targetKey = targetDock.toLowerCase() as 'left' | 'top' | 'right';
        const targetDockState = newDocks[targetKey];

        // Find and update the target slot
        const newSlots = targetDockState.slots.map((slot) => {
          if (slot.id === slotId) {
            const newPanels = [...slot.panels];
            newPanels.splice(insertPositionInSlot, 0, { id: popupId, order: insertPositionInSlot, size: 100 });

            // Recalculate panel sizes within slot
            const evenSize = 100 / newPanels.length;
            newPanels.forEach((p, i) => {
              p.order = i;
              p.size = evenSize;
            });

            return { ...slot, panels: newPanels };
          }
          return slot;
        });

        newDocks[targetKey] = { ...targetDockState, slots: newSlots };

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
            },
          },
        };
      });
    },
    [removePanelFromDocks]
  );

  const undockPopup = useCallback((popupId: string) => {
    setLayoutState((prev) => {
      let sourceDockKey: 'left' | 'top' | 'right' | null = null;
      let sourceDockSize = 0;
      let slotSizePercent = 100;
      let panelSizePercent = 100;

      // Find source dock and slot info before removing
      for (const key of ['left', 'top', 'right'] as const) {
        const dock = prev.docks[key];
        for (const slot of dock.slots) {
          const panelIdx = slot.panels.findIndex((p) => p.id === popupId);
          if (panelIdx !== -1) {
            sourceDockKey = key;
            sourceDockSize = dock.size;
            slotSizePercent = slot.size;
            panelSizePercent = slot.panels[panelIdx].size;
            break;
          }
        }
        if (sourceDockKey) break;
      }

      // Remove popup from all docks
      const { docks: newDocks } = removePanelFromDocks(prev.docks, popupId);

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
          width = Math.max(300, (contentWidth * slotSizePercent) / 100);
          height = Math.max(200, (sourceDockSize * panelSizePercent) / 100);
        } else if (sourceDockKey) {
          const topDockHeight = prev.docks.top.slots.length > 0 ? prev.docks.top.size : 0;
          const availableHeight = (contentArea?.offsetHeight ?? 600) - topDockHeight;
          width = Math.max(300, (sourceDockSize * panelSizePercent) / 100);
          height = Math.max(200, (availableHeight * slotSizePercent) / 100);
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
  }, [removePanelFromDocks]);

  const removePopupFromDock = useCallback((popupId: string) => {
    setLayoutState((prev) => {
      // Remove popup from all docks using helper
      const { docks: newDocks } = removePanelFromDocks(prev.docks, popupId);

      // Remove from floating panels
      const newFloatingPanels = prev.floatingPanels.filter((p) => p.id !== popupId);

      return {
        ...prev,
        docks: newDocks,
        floatingPanels: newFloatingPanels,
      };
    });
  }, [removePanelFromDocks]);

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
      movePanelToSlot,
      undockPanel,
      dockFloatingPanel,
      dockFloatingPanelToSlot,
      updateFloatingPanel,
      resizeDock,
      resizeSlot,
      resizePanelInSlot,
      reorderPanels,
      updateDragState,
      resetLayout,
      findPanelDock,
      findPanelSlot,
      findFloatingPanel,
      // Popup panel methods
      getPopupDockState,
      updatePopupDockState,
      dockPopup,
      dockPopupToSlot,
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
      movePanelToSlot,
      undockPanel,
      dockFloatingPanel,
      dockFloatingPanelToSlot,
      updateFloatingPanel,
      resizeDock,
      resizeSlot,
      resizePanelInSlot,
      reorderPanels,
      updateDragState,
      resetLayout,
      findPanelDock,
      findPanelSlot,
      findFloatingPanel,
      // Popup panel methods
      getPopupDockState,
      updatePopupDockState,
      dockPopup,
      dockPopupToSlot,
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
