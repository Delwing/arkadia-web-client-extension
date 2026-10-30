import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { MapReturnButton } from '../components/MapReturnButton';
import { MapNoteDisplay } from '../components/MapNoteDisplay';
import { MapNoteIcon } from '../components/MapNoteIcon';
import { useMapViewingState } from '@web/layout';
import { useLayoutManager } from '@web/layout';
import { PANEL_CONFIGS } from '../types';
import eventBus from '@modules/core/eventBus';
import { getBuiltInPanelSetting } from '../utils/layoutStorage';
import { PANEL_SLOT, useHostSlot, type MovableHost } from '../movableHost';
import { MapChrome } from '@web/app/shell/MapChrome';

interface MapPanelProps {
  /** The map's drawing surface; held here while the panel is mounted. */
  mapHost: MovableHost;
}

export function MapPanel({ mapHost }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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

  // The map shows here while the panel is mounted, and goes back to its default
  // spot when it closes. The renderer sizes its canvas on window resize.
  useHostSlot(mapHost, containerRef, PANEL_SLOT);
  useLayoutEffect(() => {
    window.dispatchEvent(new Event('resize'));
    return () => { window.dispatchEvent(new Event('resize')); };
  }, [mapHost]);

  // Use ResizeObserver to trigger map resize when container size changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Dispatch resize event so the map renderer updates its canvas. Everything
    // else listening for window resizes runs too, so a splitter drag sends at
    // most one a frame.
    let frame = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        window.dispatchEvent(new Event('resize'));
      });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="map-panel-container">
      <MapReturnButton />
      <MapNoteDisplay />
      <MapNoteIcon />
      <MapChrome labelVisible={labelVisible} />
    </div>
  );
}
