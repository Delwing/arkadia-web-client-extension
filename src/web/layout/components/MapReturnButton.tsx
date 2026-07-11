import {useCallback, useEffect, useState} from 'react';
import {getEmbeddedMap, subscribeEmbeddedMap} from '@web/embedRegistry';

export function MapReturnButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Re-attach whenever the map instance arrives or is replaced, rather than
    // polling globalThis on a timer.
    let unsubscribeView: (() => void) | null = null;
    const unsubscribeMap = subscribeEmbeddedMap((embedded) => {
      unsubscribeView?.();
      unsubscribeView = null;
      if (!embedded) return;
      setIsVisible(!embedded.isViewingPlayerPosition);
      unsubscribeView = embedded.onViewChange((isViewingPlayer: boolean) => {
        setIsVisible(!isViewingPlayer);
      });
    });

    return () => {
      unsubscribeMap();
      unsubscribeView?.();
    };
  }, []);

  const handleClick = useCallback(() => {
    getEmbeddedMap()?.returnToPlayer?.();
  }, []);

  if (!isVisible) return null;

  return (
    <button
      type="button"
      className="map-return-button"
      onClick={handleClick}
      title="Wroc do aktualnej lokacji"
    >
      Wroc do aktualnej lokacji
    </button>
  );
}
