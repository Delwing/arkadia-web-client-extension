import { useEffect, useState } from 'react';
import { subscribeEmbeddedMap } from '@web/embedRegistry';

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

  useEffect(() => {
    // Re-attach whenever the map instance arrives or is replaced, rather than
    // polling globalThis on a timer.
    let unsubscribeView: (() => void) | null = null;
    const unsubscribeMap = subscribeEmbeddedMap((embedded) => {
      unsubscribeView?.();
      unsubscribeView = null;
      if (!embedded) return;

      setState({
        isViewingDifferentArea: !embedded.isViewingPlayerPosition,
        viewedAreaName: embedded.getViewedAreaName(),
      });

      unsubscribeView = embedded.onViewChange((isViewingPlayer: boolean, areaName?: string) => {
        setState({
          isViewingDifferentArea: !isViewingPlayer,
          viewedAreaName: areaName,
        });
      });
    });

    return () => {
      unsubscribeMap();
      unsubscribeView?.();
    };
  }, []);

  return state;
}
