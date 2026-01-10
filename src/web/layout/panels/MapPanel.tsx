import { useEffect, useRef, useState, useCallback } from 'react';
import { MapReturnButton } from '../components/MapReturnButton';
import { useMapViewingState } from '@web/layout';
import { useLayoutManager } from '@web/layout';
import { PANEL_CONFIGS } from '../types';
import eventBus from '@modules/core/eventBus';
import { getBuiltInPanelSetting } from '../utils/layoutStorage';

interface MapPanelProps {
  mapElement: HTMLElement | null;
}

export function MapPanel({ mapElement }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const originalParentRef = useRef<HTMLElement | null>(null);
  const locationWrapperRef = useRef<HTMLElement | null>(null);
  const { updateBuiltInPanelState } = useLayoutManager();
  const mapViewingState = useMapViewingState();
  const [labelVisible, setLabelVisible] = useState(() => getBuiltInPanelSetting('map', 'labelVisible', true));
  const [locationLabel, setLocationLabel] = useState('');
  const [isPaused, setIsPaused] = useState(false);

  // Listen for label visibility changes from MapHeaderMenu
  useEffect(() => {
    const handleVisibility = (visible: boolean) => {
      setLabelVisible(visible);
    };
    eventBus.on('mapLabelVisibility', handleVisibility);
    return () => {
      eventBus.off('mapLabelVisibility', handleVisibility);
    };
  }, []);

  // Listen for location label updates (for title when label is hidden)
  useEffect(() => {
    const handleLocationLabel = (label: string) => {
      setLocationLabel(label);
    };
    eventBus.on('mapLocationLabel', handleLocationLabel);
    // Request current label on mount
    eventBus.emit('requestMapLocationLabel');
    return () => {
      eventBus.off('mapLocationLabel', handleLocationLabel);
    };
  }, []);

  // Listen for pause state changes
  useEffect(() => {
    const handlePauserStart = () => setIsPaused(true);
    const handlePauserEnd = () => setIsPaused(false);
    eventBus.on('pauserStart', handlePauserStart);
    eventBus.on('pauserEnd', handlePauserEnd);
    return () => {
      eventBus.off('pauserStart', handlePauserStart);
      eventBus.off('pauserEnd', handlePauserEnd);
    };
  }, []);

  // Update location-wrapper visibility
  useEffect(() => {
    if (locationWrapperRef.current) {
      locationWrapperRef.current.style.display = labelVisible ? '' : 'none';
    }
  }, [labelVisible]);

  // Build title with label info when label is hidden
  const buildTitle = useCallback(() => {
    const baseTitle = PANEL_CONFIGS.map?.title ?? 'Mapa';

    // If viewing a different area, show that in the title
    if (mapViewingState.isViewingDifferentArea && mapViewingState.viewedAreaName) {
      return `${baseTitle} (${mapViewingState.viewedAreaName})`;
    }

    // If label is hidden, show location info in title
    if (!labelVisible && locationLabel) {
      const pauseIndicator = isPaused ? ' ⏸' : '';
      return `${baseTitle}: ${locationLabel}${pauseIndicator}`;
    }

    return baseTitle;
  }, [mapViewingState.isViewingDifferentArea, mapViewingState.viewedAreaName, labelVisible, locationLabel, isPaused]);

  // Update panel title when relevant state changes
  useEffect(() => {
    const title = buildTitle();
    updateBuiltInPanelState('map', { title });
  }, [buildTitle, updateBuiltInPanelState]);

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
      // Apply initial visibility based on saved setting
      locationWrapper.style.display = labelVisible ? '' : 'none';
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
    // Note: labelVisible is intentionally excluded to prevent re-running the entire effect
    // when visibility changes - we have a separate effect for that
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div ref={containerRef} className="map-panel-container">
      <MapReturnButton />
    </div>
  );
}
