import { useState, useCallback, useEffect, useRef } from 'react';
import eventBus from '@modules/core/eventBus';
import { useBuiltInPanelSetting } from '../../hooks/useBuiltInPanelSetting';

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
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Emit label visibility state on mount and when it changes
  useEffect(() => {
    eventBus.emit('mapLabelVisibility', labelVisible);
  }, [labelVisible]);

  // Emit alwaysShowNote state on mount and when it changes
  useEffect(() => {
    eventBus.emit('mapAlwaysShowNote', alwaysShowNote);
  }, [alwaysShowNote]);

  const calculateDropdownPosition = useCallback(() => {
    if (toggleRef.current) {
      const rect = toggleRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      // Calculate available space below the button with some padding
      const availableSpace = viewportHeight - rect.bottom - 16;
      // Ensure at least some minimum height (100px) and cap at 300px
      const maxHeight = Math.max(100, Math.min(300, availableSpace));
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
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

  const getEmbedded = useCallback(() => {
    return (globalThis as any).embedded;
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

  const handleToggleLabel = useCallback(() => {
    setLabelVisible((prev) => !prev);
    closeMenu();
  }, [setLabelVisible, closeMenu]);

  const handleToggleAlwaysShowNote = useCallback(() => {
    setAlwaysShowNote((prev) => !prev);
    closeMenu();
  }, [setAlwaysShowNote, closeMenu]);

  const handleCopyAsImage = useCallback(async () => {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    // Konva creates multiple canvas layers - we need to composite them all
    const canvases = mapContainer.querySelectorAll('canvas');
    if (canvases.length === 0) return;

    closeMenu();

    try {
      // Get dimensions from the first canvas
      const width = canvases[0].width;
      const height = canvases[0].height;

      // Create a composite canvas
      const compositeCanvas = document.createElement('canvas');
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

      const blob = await new Promise<Blob>((resolve, reject) => {
        compositeCanvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Failed to create image blob'));
          },
          'image/png'
        );
      });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
    } catch (err) {
      console.error('Failed to copy map as image:', err);
    }
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
