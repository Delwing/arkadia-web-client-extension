import {useCallback, useEffect, useState} from 'react';

export function MapReturnButton() {
  const [isVisible, setIsVisible] = useState(false);

  const getEmbedded = useCallback(() => {
    return (globalThis as any).embedded;
  }, []);

  useEffect(() => {
    const embedded = getEmbedded();
    if (!embedded?.onViewChange) return;

    // Set initial state
    setIsVisible(!embedded.isViewingPlayerPosition);

    // Subscribe to changes
    return embedded.onViewChange((isViewingPlayer: boolean) => {
      setIsVisible(!isViewingPlayer);
    });
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
