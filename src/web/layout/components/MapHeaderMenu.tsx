import { useState, useCallback, useEffect, useRef } from 'react';
import eventBus from '@modules/core/eventBus';
import { useBuiltInPanelSetting } from '../../hooks/useBuiltInPanelSetting';
import { copyCanvasToClipboard } from '@shared/dom/copyCanvasToClipboard.ts';
import { getPopupSetting, setPopupSetting } from '../../layout/utils/layoutStorage';
import { getEmbeddedMap } from '@web/embedRegistry';

interface MapHeaderMenuProps {
  className?: string;
}

type SubmenuType = 'none' | 'areas' | 'levels';

// Cache for levels per area (areaId -> sorted levels array)
const levelsCache = new Map<number, number[]>();

export function MapHeaderMenu({ className = '' }: MapHeaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [submenu, setSubmenu] = useState<SubmenuType>('none');
  const [areas, setAreas] = useState<{ id: number | string; name: string }[]>([]);
  const [levels, setLevels] = useState<number[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);
  const [viewedAreaId, setViewedAreaId] = useState<number | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
  const [labelVisible, setLabelVisible] = useBuiltInPanelSetting('map', 'labelVisible', true);
  const [alwaysShowNote, setAlwaysShowNote] = useBuiltInPanelSetting('map', 'alwaysShowNote', false);
  const [showGrid, setShowGrid] = useBuiltInPanelSetting('map', 'showGrid', false);
  const [showAreaExitLabels, setShowAreaExitLabels] = useBuiltInPanelSetting('map', 'showAreaExitLabels', true);
  const [showTransportStops, setShowTransportStops] = useBuiltInPanelSetting('map', 'showTransportStops', false);
  const [hintsEnabled, setHintsEnabled] = useState(() =>
    getPopupSetting('popup:knowledgeDetails', 'showHints', false)
  );
  const [showCompleted, setShowCompleted] = useState(() =>
    !getPopupSetting('popup:knowledgeDetails', 'hideCompleted', false)
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

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

  const calculateDropdownPosition = useCallback(() => {
    if (toggleRef.current) {
      // Use the button's own window so the dropdown positions correctly even
      // when the panel has been popped out into a separate browser window.
      const win = toggleRef.current.ownerDocument.defaultView ?? window;
      const rect = toggleRef.current.getBoundingClientRect();
      const viewportHeight = win.innerHeight;
      // Calculate available space below the button with some padding
      const availableSpace = viewportHeight - rect.bottom - 16;
      // Ensure at least some minimum height (100px) and cap at 360px
      const maxHeight = Math.max(100, Math.min(360, availableSpace));
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        right: win.innerWidth - rect.right,
        maxHeight,
      });
    }
  }, []);

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        // Calculate position when opening
        calculateDropdownPosition();
      }
      return !prev;
    });
    setSubmenu('none');
  }, [calculateDropdownPosition]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setSubmenu('none');
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, closeMenu]);

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

  const handleToggleLabel = useCallback(() => {
    setLabelVisible((prev) => !prev);
    closeMenu();
  }, [setLabelVisible, closeMenu]);

  const handleToggleAlwaysShowNote = useCallback(() => {
    setAlwaysShowNote((prev) => !prev);
    closeMenu();
  }, [setAlwaysShowNote, closeMenu]);

  const handleToggleGrid = useCallback(() => {
    setShowGrid((prev) => !prev);
    closeMenu();
  }, [setShowGrid, closeMenu]);

  const handleToggleAreaExitLabels = useCallback(() => {
    setShowAreaExitLabels((prev) => !prev);
    closeMenu();
  }, [setShowAreaExitLabels, closeMenu]);

  const handleToggleTransportStops = useCallback(() => {
    setShowTransportStops((prev) => !prev);
    closeMenu();
  }, [setShowTransportStops, closeMenu]);

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
    <div ref={menuRef} className={`map-header-menu ${className}`}>
      <button
        type="button"
        className="map-header-menu__image-btn"
        onClick={handleCopyAsImage}
        title="Kopiuj jako obraz"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>
      <button
        ref={toggleRef}
        type="button"
        className="map-header-menu__toggle"
        onClick={toggleMenu}
        title="Menu mapy"
      >
        <span className="map-header-menu__hamburger" />
      </button>

      {isOpen && (
        <div
          className="map-header-menu__dropdown"
          style={dropdownStyle ?? undefined}
        >
          {submenu === 'areas' ? (
            <>
              <button
                type="button"
                className="map-header-menu__item map-header-menu__item--back"
                onClick={handleBackToMenu}
              >
                &larr; Powrot
              </button>
              <div
                className="map-header-menu__area-list"
                style={dropdownStyle?.maxHeight ? { maxHeight: (dropdownStyle.maxHeight as number) - 40 } : undefined}
              >
                {areas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    className="map-header-menu__item"
                    onClick={() => handleSelectArea(area.id)}
                  >
                    {area.name}
                  </button>
                ))}
              </div>
            </>
          ) : submenu === 'levels' ? (
            <>
              <button
                type="button"
                className="map-header-menu__item map-header-menu__item--back"
                onClick={handleBackToMenu}
              >
                &larr; Powrot
              </button>
              <div
                className="map-header-menu__area-list"
                style={dropdownStyle?.maxHeight ? { maxHeight: (dropdownStyle.maxHeight as number) - 40 } : undefined}
              >
                {levels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`map-header-menu__item${level === currentLevel ? ' map-header-menu__item--active' : ''}`}
                    onClick={() => handleSelectLevel(level)}
                  >
                    Poziom {level}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                className="map-header-menu__item"
                onClick={handleShowAreas}
              >
                Zmien obszar
              </button>
              <button
                type="button"
                className="map-header-menu__item"
                onClick={handleShowLevels}
              >
                Zmien poziom
              </button>
              <div className="map-header-menu__zoom-row">
                <button
                  type="button"
                  className="map-header-menu__item"
                  onClick={handleZoomIn}
                >
                  Zbliz
                </button>
                <button
                  type="button"
                  className="map-header-menu__item"
                  onClick={handleZoomOut}
                >
                  Oddal
                </button>
              </div>
              <button
                type="button"
                className="map-header-menu__item"
                onClick={handleOpenSkroty}
              >
                Skroty
              </button>
              <button
                type="button"
                className="map-header-menu__item"
                onClick={handleOpenTripPlanner}
              >
                Planer trasy
              </button>
              <button
                type="button"
                className="map-header-menu__item map-header-menu__item--checkbox"
                onClick={handleToggleLabel}
              >
                <span className={`map-header-menu__checkbox${!labelVisible ? ' map-header-menu__checkbox--checked' : ''}`} />
                Etykieta w naglowku
              </button>
              <button
                type="button"
                className="map-header-menu__item map-header-menu__item--checkbox"
                onClick={handleToggleAlwaysShowNote}
              >
                <span className={`map-header-menu__checkbox${alwaysShowNote ? ' map-header-menu__checkbox--checked' : ''}`} />
                Notatka zawsze widoczna
              </button>
              <button
                type="button"
                className="map-header-menu__item map-header-menu__item--checkbox"
                onClick={handleToggleGrid}
              >
                <span className={`map-header-menu__checkbox${showGrid ? ' map-header-menu__checkbox--checked' : ''}`} />
                Siatka
              </button>
              <button
                type="button"
                className="map-header-menu__item map-header-menu__item--checkbox"
                onClick={handleToggleAreaExitLabels}
              >
                <span className={`map-header-menu__checkbox${showAreaExitLabels ? ' map-header-menu__checkbox--checked' : ''}`} />
                Etykiety wyjsc obszaru
              </button>
              <button
                type="button"
                className="map-header-menu__item map-header-menu__item--checkbox"
                onClick={handleToggleTransportStops}
              >
                <span className={`map-header-menu__checkbox${showTransportStops ? ' map-header-menu__checkbox--checked' : ''}`} />
                Przystanki transportu
              </button>
              {hintsEnabled && (
                <button
                  type="button"
                  className="map-header-menu__item map-header-menu__item--checkbox"
                  onClick={handleToggleShowCompleted}
                >
                  <span className={`map-header-menu__checkbox${showCompleted ? ' map-header-menu__checkbox--checked' : ''}`} />
                  Wiedza: pokaz ukonczone
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
