import { useCallback, useEffect, useState } from 'react';

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

  const getEmbedded = useCallback(() => {
    return (globalThis as any).embedded;
  }, []);

  useEffect(() => {
    const embedded = getEmbedded();
    if (!embedded?.onViewChange) return;

    // Set initial state
    setState({
      isViewingDifferentArea: !embedded.isViewingPlayerPosition,
      viewedAreaName: embedded.getViewedAreaName?.(),
    });

    // Subscribe to changes
    return embedded.onViewChange((isViewingPlayer: boolean, areaName?: string) => {
      setState({
        isViewingDifferentArea: !isViewingPlayer,
        viewedAreaName: areaName,
      });
    });
  }, [getEmbedded]);

  return state;
}
