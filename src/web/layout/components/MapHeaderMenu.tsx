import { useState, useCallback, useEffect } from 'react';
import eventBus from '@modules/core/eventBus';
import { useBuiltInPanelSetting } from '../../hooks/useBuiltInPanelSetting';
import { copyCanvasToClipboard } from '@shared/dom/copyCanvasToClipboard.ts';
import { getPopupSetting, setPopupSetting } from '../../layout/utils/layoutStorage';
import { getEmbeddedMap } from '@web/embedRegistry';
import { usePopover } from '../hooks/usePopover';
import { HeaderMenu, MenuBack, MenuCheckItem, MenuItem, MenuRow, MenuScroll } from './HeaderMenu';

interface MapHeaderMenuProps {
  className?: string;
}

type SubmenuType = 'none' | 'areas' | 'levels';

// Cache for levels per area (areaId -> sorted levels array)
const levelsCache = new Map<number, number[]>();

export function MapHeaderMenu({ className = '' }: MapHeaderMenuProps) {
  const [submenu, setSubmenu] = useState<SubmenuType>('none');
  const [areas, setAreas] = useState<{ id: number | string; name: string }[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);
  const [viewedAreaId, setViewedAreaId] = useState<number | null>(null);
  // Toggled from the map's settings cog (MAP_SETTINGS_FIELDS); read here to
  // push each change to the map renderer.
  const [labelVisible] = useBuiltInPanelSetting('map', 'labelVisible', true);
  const [alwaysShowNote] = useBuiltInPanelSetting('map', 'alwaysShowNote', false);
  const [showGrid] = useBuiltInPanelSetting('map', 'showGrid', false);
  const [showAreaExitLabels] = useBuiltInPanelSetting('map', 'showAreaExitLabels', true);
  const [showTransportStops] = useBuiltInPanelSetting('map', 'showTransportStops', false);
  const [showCarriageBlocks] = useBuiltInPanelSetting('map', 'showCarriageBlocks', false);
  const [hintsEnabled, setHintsEnabled] = useState(() =>
    getPopupSetting('popup:knowledgeDetails', 'showHints', false)
  );
  const [showCompleted, setShowCompleted] = useState(() =>
    !getPopupSetting('popup:knowledgeDetails', 'hideCompleted', false)
  );
  // Every close (action, click-away, Escape) returns to the top level.
  const menu = usePopover({ onClose: () => setSubmenu('none') });
  const closeMenu = menu.close;

  const getEmbedded = useCallback(() => {
    return getEmbeddedMap();
  }, []);

  // Emit label visibility state on mount and when it changes
  useEffect(() => {
    eventBus.emit('mapLabelVisibility', labelVisible);
  }, [labelVisible]);

  // Emit alwaysShowNote state on mount and when it changes
  useEffect(() => {
    eventBus.emit('mapAlwaysShowNote', alwaysShowNote);
  }, [alwaysShowNote]);

  // Emit showGrid state on mount and when it changes
  useEffect(() => {
    const embedded = getEmbedded();
    if (embedded?.settings) embedded.settings.gridEnabled = showGrid;
    eventBus.emit('mapShowGrid', showGrid);
  }, [showGrid, getEmbedded]);

  // Emit showAreaExitLabels state on mount and when it changes
  useEffect(() => {
    const embedded = getEmbedded();
    if (embedded?.settings) embedded.settings.areaExitLabels = showAreaExitLabels;
    eventBus.emit('mapShowAreaExitLabels', showAreaExitLabels);
  }, [showAreaExitLabels, getEmbedded]);

  // Emit showTransportStops state on mount and when it changes
  useEffect(() => {
    eventBus.emit('mapShowTransportStops', showTransportStops);
  }, [showTransportStops]);

  useEffect(() => {
    eventBus.emit('mapShowCarriageBlocks', showCarriageBlocks);
  }, [showCarriageBlocks]);

  // Keep hintsEnabled and showCompleted in sync with KnowledgeDetailsReport
  useEffect(() => {
    const handler = (detail: unknown) => {
      const payload = detail as { enabled: boolean; hideCompleted: boolean } | undefined;
      setHintsEnabled(payload?.enabled ?? false);
      if (payload) {
        setShowCompleted(!payload.hideCompleted);
      }
    };
    eventBus.on('knowledgeHints', handler);
    return () => { eventBus.off('knowledgeHints', handler); };
  }, []);

  const handleZoomIn = useCallback(() => {
    const embedded = getEmbedded();
    if (!embedded?.renderer || !embedded?.reader) return;
    const currentZoom = embedded.renderer.getZoom();
    embedded.zoomToCenter(currentZoom * 1.1);
    closeMenu();
  }, [getEmbedded, closeMenu]);

  const handleZoomOut = useCallback(() => {
    const embedded = getEmbedded();
    if (!embedded?.renderer || !embedded?.reader) return;
    const currentZoom = embedded.renderer.getZoom();
    embedded.zoomToCenter(currentZoom / 1.1);
    closeMenu();
  }, [getEmbedded, closeMenu]);

  const handleShowAreas = useCallback(() => {
    const embedded = getEmbedded();
    if (!embedded?.reader) return;

    const reader = embedded.reader;
    // Get areas using reader.getAreas()
    try {
      if (typeof reader.getAreas === 'function') {
        const rawAreas = reader.getAreas() ?? [];
        const areaList = rawAreas
          .map((area: any) => {
            // Skip areas without rooms
            const areaRooms = area?.getRooms?.() ?? [];
            if (areaRooms.length === 0) return null;

            const id = area?.getAreaId?.() ?? area?.areaId ?? area?.id;
            const name = area?.getAreaName?.() ?? area?.areaName ?? area?.name;
            if (id === undefined || id === null) return null;
            return {
              id,
              name: name || `Area ${id}`,
            };
          })
          .filter((area: any) => area !== null)
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
        setAreas(areaList);
      }
    } catch (e) {
      console.error('Error loading areas:', e);
    }
    setSubmenu('areas');
  }, [getEmbedded]);

  const handleSelectArea = useCallback((areaId: number | string) => {
    const embedded = getEmbedded();
    if (!embedded?.reader) return;

    const numericId = typeof areaId === 'string' ? parseInt(areaId, 10) : areaId;
    // Always show level 0 when changing area
    embedded.viewAreaLevel(numericId, 0);
    setViewedAreaId(numericId);
    closeMenu();
  }, [getEmbedded, closeMenu]);

  const handleShowLevels = useCallback(() => {
    const embedded = getEmbedded();
    if (!embedded?.reader) return;

    // Use currently viewed area, or fall back to player's current room area
    let areaId = viewedAreaId;
    let currentZ = 0;

    if (areaId === null && typeof embedded.currentRoom === 'number') {
      const currentRoomData = embedded.reader.getRoom(embedded.currentRoom);
      if (currentRoomData) {
        areaId = currentRoomData.area;
        currentZ = currentRoomData.z;
      }
    }

    if (areaId === null) return;

    // Check cache first
    let sortedLevels = levelsCache.get(areaId);
    if (!sortedLevels) {
      const area = embedded.reader.getArea?.(areaId);
      const rooms = area?.getRooms?.() ?? [];

      const levelSet = new Set<number>();
      for (const room of rooms) {
        levelSet.add(room.z);
      }

      sortedLevels = Array.from(levelSet).sort((a, b) => b - a);
      levelsCache.set(areaId, sortedLevels);
    }

    setLevels(sortedLevels);
    setCurrentLevel(currentZ);
    setSubmenu('levels');
  }, [getEmbedded, viewedAreaId]);

  const handleSelectLevel = useCallback((level: number) => {
    const embedded = getEmbedded();
    if (!embedded?.reader) return;

    // Use currently viewed area, or fall back to player's current room area
    let areaId = viewedAreaId;
    if (areaId === null && typeof embedded.currentRoom === 'number') {
      const currentRoomData = embedded.reader.getRoom(embedded.currentRoom);
      if (currentRoomData) {
        areaId = currentRoomData.area;
      }
    }

    if (areaId === null) return;

    embedded.viewAreaLevel(areaId, level);
    setCurrentLevel(level);
    closeMenu();
  }, [getEmbedded, closeMenu, viewedAreaId]);

  const handleBackToMenu = useCallback(() => {
    setSubmenu('none');
  }, []);

  const handleOpenSkroty = useCallback(() => {
    eventBus.emit('skroty.popup.open');
    closeMenu();
  }, [closeMenu]);

  const handleOpenTripPlanner = useCallback(() => {
    eventBus.emit('tripPlanner.popup.open');
    closeMenu();
  }, [closeMenu]);

  const handleToggleShowCompleted = useCallback(() => {
    const newShowCompleted = !showCompleted;
    setShowCompleted(newShowCompleted);
    const hideCompleted = !newShowCompleted;
    setPopupSetting('popup:knowledgeDetails', 'hideCompleted', hideCompleted);
    eventBus.emit('knowledgeHints', { enabled: true, hideCompleted });
    closeMenu();
  }, [showCompleted, closeMenu]);

  const handleCopyAsImage = useCallback(async (e: React.MouseEvent) => {
    // Resolve against the button's own document so the map is found whether the
    // panel is docked in the main window or popped out into its own window.
    const doc = (e.currentTarget as HTMLElement).ownerDocument;
    const mapContainer = doc.getElementById('map');
    if (!mapContainer) return;

    // Konva creates multiple canvas layers - we need to composite them all
    const canvases = mapContainer.querySelectorAll('canvas');
    if (canvases.length === 0) return;

    try {
      // Get dimensions from the first canvas
      const width = canvases[0].width;
      const height = canvases[0].height;

      // Create a composite canvas
      const compositeCanvas = doc.createElement('canvas');
      compositeCanvas.width = width;
      compositeCanvas.height = height;
      const ctx = compositeCanvas.getContext('2d');
      if (!ctx) return;

      // Fill with background color first
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // Draw each layer canvas onto the composite (they're stacked in DOM order)
      for (const canvas of canvases) {
        ctx.drawImage(canvas, 0, 0);
      }

      // clipboard.write() must be called before closeMenu() — closing the
      // menu triggers a React re-render that can invalidate the transient
      // user activation required by Safari for clipboard access.
      await copyCanvasToClipboard(compositeCanvas);
    } catch (err) {
      console.error('Failed to copy map as image:', err);
    }
    closeMenu();
  }, [closeMenu]);

  return (
    <div className={`map-header-actions ${className}`.trim()}>
      <button
        type="button"
        className="popup-btn popup-btn--icon map-header-actions__image"
        onClick={handleCopyAsImage}
        title="Kopiuj jako obraz"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>
      <HeaderMenu menu={menu} title="Menu mapy">
        {submenu === 'areas' ? (
          <>
            <MenuBack onClick={handleBackToMenu} />
            <MenuScroll>
              {areas.map((area) => (
                <MenuItem key={area.id} onClick={() => handleSelectArea(area.id)}>{area.name}</MenuItem>
              ))}
            </MenuScroll>
          </>
        ) : submenu === 'levels' ? (
          <>
            <MenuBack onClick={handleBackToMenu} />
            <MenuScroll>
              {levels.map((level) => (
                <MenuItem key={level} active={level === currentLevel} onClick={() => handleSelectLevel(level)}>
                  Poziom {level}
                </MenuItem>
              ))}
            </MenuScroll>
          </>
        ) : (
          <>
            <MenuItem onClick={handleShowAreas}>Zmien obszar</MenuItem>
            <MenuItem onClick={handleShowLevels}>Zmien poziom</MenuItem>
            <MenuRow>
              <MenuItem onClick={handleZoomIn}>Zbliz</MenuItem>
              <MenuItem onClick={handleZoomOut}>Oddal</MenuItem>
            </MenuRow>
            <MenuItem onClick={handleOpenSkroty}>Skroty</MenuItem>
            <MenuItem onClick={handleOpenTripPlanner}>Planer trasy</MenuItem>
            {hintsEnabled && (
              <MenuCheckItem checked={showCompleted} onClick={handleToggleShowCompleted}>
                Wiedza: pokaz ukonczone
              </MenuCheckItem>
            )}
          </>
        )}
      </HeaderMenu>
    </div>
  );
}
