import { useCallback, useEffect, useState, useRef } from 'react';

interface MapViewingState {
  isViewingDifferentArea: boolean;
  viewedAreaName?: string;
}

/**
 * Hook that tracks whether the map is viewing a different area (not the player's position).
 * Returns the viewing state and the name of the viewed area if different.
 */
export function useMapViewingState(): MapViewingState {
  const [state, setState] = useState<MapViewingState>({
    isViewingDifferentArea: false,
    viewedAreaName: undefined,
  });
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const getEmbedded = useCallback(() => {
    return (globalThis as any).embedded;
  }, []);

  useEffect(() => {
    const trySubscribe = () => {
      const embedded = getEmbedded();
      if (!embedded?.onViewChange) return false;

      // Set initial state
      setState({
        isViewingDifferentArea: !embedded.isViewingPlayerPosition,
        viewedAreaName: embedded.getViewedAreaName?.(),
      });

      // Subscribe to changes
      unsubscribeRef.current = embedded.onViewChange((isViewingPlayer: boolean, areaName?: string) => {
        setState({
          isViewingDifferentArea: !isViewingPlayer,
          viewedAreaName: areaName,
        });
      });
      return true;
    };

    // Try to subscribe immediately
    if (trySubscribe()) return;

    // Poll until embedded is available
    const interval = setInterval(() => {
      if (trySubscribe()) {
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
      unsubscribeRef.current?.();
    };
  }, [getEmbedded]);

  return state;
}
