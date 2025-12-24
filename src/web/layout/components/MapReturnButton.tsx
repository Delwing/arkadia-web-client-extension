import {useCallback, useEffect, useState, useRef} from 'react';

export function MapReturnButton() {
  const [isVisible, setIsVisible] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const getEmbedded = useCallback(() => {
    return (globalThis as any).embedded;
  }, []);

  useEffect(() => {
    const trySubscribe = () => {
      const embedded = getEmbedded();
      if (!embedded?.onViewChange) return false;

      // Set initial state
      setIsVisible(!embedded.isViewingPlayerPosition);

      // Subscribe to changes
      unsubscribeRef.current = embedded.onViewChange((isViewingPlayer: boolean) => {
        setIsVisible(!isViewingPlayer);
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

  const handleClick = useCallback(() => {
    const embedded = getEmbedded();
    embedded?.returnToPlayer?.();
  }, [getEmbedded]);

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
