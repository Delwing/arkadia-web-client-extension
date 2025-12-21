import { useEffect, useRef } from 'react';

interface MapPanelProps {
  mapElement: HTMLElement | null;
}

export function MapPanel({ mapElement }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const originalParentRef = useRef<HTMLElement | null>(null);
  const locationWrapperRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !mapElement) return;

    // Store original parent for cleanup
    originalParentRef.current = mapElement.parentElement;

    // Also get the location wrapper (sibling of map in #iframe-container)
    const locationWrapper = document.getElementById('location-wrapper');
    locationWrapperRef.current = locationWrapper;

    // Move map element into our container
    containerRef.current.appendChild(mapElement);

    // Move location wrapper into our container (after map)
    if (locationWrapper) {
      containerRef.current.appendChild(locationWrapper);
    }

    // Ensure map fills container
    mapElement.style.width = '100%';
    mapElement.style.height = '100%';

    // Trigger resize event so the map renderer adjusts
    window.dispatchEvent(new Event('resize'));

    return () => {
      // Restore map and location wrapper to original parent on unmount
      if (originalParentRef.current && mapElement) {
        originalParentRef.current.appendChild(mapElement);
        if (locationWrapperRef.current) {
          originalParentRef.current.appendChild(locationWrapperRef.current);
        }
        window.dispatchEvent(new Event('resize'));
      }
    };
  }, [mapElement]);

  // Use ResizeObserver to trigger map resize when container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      // Dispatch resize event so the map renderer updates its canvas
      window.dispatchEvent(new Event('resize'));
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return <div ref={containerRef} className="map-panel-container" />;
}
