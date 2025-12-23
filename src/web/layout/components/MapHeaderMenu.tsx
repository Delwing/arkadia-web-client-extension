import { useState, useCallback, useEffect, useRef } from 'react';
import eventBus from '@modules/core/eventBus';

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
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = useCallback(() => {
    setIsOpen((prev) => !prev);
    setSubmenu('none');
  }, []);

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
    embedded.setZoom(currentZoom * 1.1);
    closeMenu();
  }, [getEmbedded, closeMenu]);

  const handleZoomOut = useCallback(() => {
    const embedded = getEmbedded();
    if (!embedded?.renderer || !embedded?.reader) return;
    const currentZoom = embedded.renderer.getZoom();
    embedded.setZoom(currentZoom / 1.1);
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

  return (
    <div ref={menuRef} className={`map-header-menu ${className}`}>
      <button
        type="button"
        className="map-header-menu__toggle"
        onClick={toggleMenu}
        title="Menu mapy"
      >
        <span className="map-header-menu__hamburger" />
      </button>

      {isOpen && (
        <div className="map-header-menu__dropdown">
          {submenu === 'areas' ? (
            <>
              <button
                type="button"
                className="map-header-menu__item map-header-menu__item--back"
                onClick={handleBackToMenu}
              >
                &larr; Powrot
              </button>
              <div className="map-header-menu__area-list">
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
              <div className="map-header-menu__area-list">
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
