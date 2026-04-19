import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapRenderer, RoomContextMenuEventDetail, type RoomClickEventDetail, type AreaExitClickEventDetail } from 'mudlet-map-renderer';
import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { getNote, type LocationNote } from '@web/options/locationNotesStorage';
import { openMapContextMenu } from '@modules/core/contextMenus';
import { getPluginLocationNotes, type PluginLocationNote } from '@modules/core/pluginLocationNotesRegistry';
import { getPinnedPopupsByPrefix, getPopupLockedState, getPopupSetting, setPopupSetting, setBuiltInPanelSetting, shouldPopupAutoOpen } from './layout/utils/layoutStorage';
import { copyCanvasToClipboard } from '@shared/dom/copyCanvasToClipboard.ts';
import { showMapNoteTooltipForRoom } from './mapNoteTooltip';

interface StaticMapInstance {
    id: string;
    initialRoomId?: number;
    initialAreaId?: number;
}

interface StaticMapState {
    viewedAreaId: number | null;
    viewedLevel: number;
    zoom: number;
    currentRoom: number | null;
    initialHighlightRoom: number | null;
    titleRoomId: number | null;
    titleAreaName: string;
    followPlayer: boolean;
    showGrid: boolean;
    showAreaExitLabels: boolean;
}

type SubmenuType = 'none' | 'areas' | 'levels';

const levelsCache = new Map<number, number[]>();

function StaticMapMenu({
    rendererRef,
    state,
    setState,
    loadLevels,
    renderPathsAndHighlights,
}: {
    rendererRef: React.MutableRefObject<MapRenderer | null>;
    state: StaticMapState;
    setState: React.Dispatch<React.SetStateAction<StaticMapState>>;
    loadLevels: (areaId: number) => void;
    renderPathsAndHighlights: () => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [submenu, setSubmenu] = useState<SubmenuType>('none');
    const [areas, setAreas] = useState<{ id: number; name: string }[]>([]);
    const [levels, setLevels] = useState<number[]>([]);
    const menuRef = useRef<HTMLDivElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);

    const getEmbedded = useCallback(() => (globalThis as any).embedded, []);

    const calculateDropdownPosition = useCallback(() => {
        if (toggleRef.current) {
            const rect = toggleRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const availableSpace = viewportHeight - rect.bottom - 16;
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
            if (!prev) calculateDropdownPosition();
            return !prev;
        });
        setSubmenu('none');
    }, [calculateDropdownPosition]);

    const closeMenu = useCallback(() => {
        setIsOpen(false);
        setSubmenu('none');
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                closeMenu();
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMenu();
        };
        window.addEventListener('pointerdown', handleClickOutside);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('pointerdown', handleClickOutside);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, closeMenu]);

    const handleShowAreas = useCallback(() => {
        const embedded = getEmbedded();
        if (!embedded?.reader) return;
        const reader = embedded.reader;
        if (typeof reader.getAreas !== 'function') return;

        const rawAreas = reader.getAreas() ?? [];
        const areaList = rawAreas
            .map((area: any) => {
                const areaRooms = area?.getRooms?.() ?? [];
                if (areaRooms.length === 0) return null;
                const id = area?.getAreaId?.() ?? area?.areaId ?? area?.id;
                const name = area?.getAreaName?.() ?? area?.areaName ?? area?.name;
                if (id === undefined || id === null) return null;
                return { id, name: name || `Area ${id}` };
            })
            .filter((area: any) => area !== null)
            .sort((a: any, b: any) => a.name.localeCompare(b.name));
        setAreas(areaList);
        setSubmenu('areas');
    }, [getEmbedded]);

    const handleSelectArea = useCallback((areaId: number) => {
        const embedded = getEmbedded();
        const renderer = rendererRef.current;
        if (!embedded?.reader || !renderer) return;

        renderer.drawArea(areaId, 0);

        const area = embedded.reader.getArea?.(areaId);
        const areaName = area?.getAreaName?.() ?? area?.areaName ?? `Obszar ${areaId}`;
        const rooms = area?.getRooms?.() ?? [];
        const roomsAtLevel = rooms.filter((r: any) => r.z === 0);

        if (roomsAtLevel.length > 0) {
            let sumX = 0, sumY = 0;
            for (const room of roomsAtLevel) {
                sumX += room.x;
                sumY += room.y;
            }
            const avgX = sumX / roomsAtLevel.length;
            const avgY = sumY / roomsAtLevel.length;
            let closestRoom = roomsAtLevel[0];
            let minDist = Infinity;
            for (const room of roomsAtLevel) {
                const dist = Math.abs(room.x - avgX) + Math.abs(room.y - avgY);
                if (dist < minDist) {
                    minDist = dist;
                    closestRoom = room;
                }
            }
            renderer.setPosition(closestRoom.id);
        }

        // Update player marker to actual position (will hide if not on this area/level)
        const actualPlayerRoom = embedded.currentRoom;
        if (actualPlayerRoom) {
            renderer.updatePositionMarker(actualPlayerRoom);
        }

        loadLevels(areaId);
        setState(currentState => {
            // Check if this is the initial area
            const isInitialArea = currentState.initialHighlightRoom !== null &&
                embedded.reader.getRoom(currentState.initialHighlightRoom)?.area === areaId;

            return {
                ...currentState,
                viewedAreaId: areaId,
                viewedLevel: 0,
                // Only show room number if viewing initial area
                titleRoomId: isInitialArea ? currentState.initialHighlightRoom : null,
                titleAreaName: areaName,
            };
        });
        renderPathsAndHighlights();
        closeMenu();
    }, [getEmbedded, rendererRef, loadLevels, setState, renderPathsAndHighlights, closeMenu]);

    const handleShowLevels = useCallback(() => {
        if (state.viewedAreaId === null) return;
        let sortedLevels = levelsCache.get(state.viewedAreaId);
        if (!sortedLevels) {
            const embedded = getEmbedded();
            const area = embedded?.reader?.getArea?.(state.viewedAreaId);
            const rooms = area?.getRooms?.() ?? [];
            const levelSet = new Set<number>();
            for (const room of rooms) levelSet.add(room.z);
            sortedLevels = Array.from(levelSet).sort((a, b) => b - a);
            levelsCache.set(state.viewedAreaId, sortedLevels);
        }
        setLevels(sortedLevels);
        setSubmenu('levels');
    }, [getEmbedded, state.viewedAreaId]);

    const handleSelectLevel = useCallback((level: number) => {
        const embedded = getEmbedded();
        const renderer = rendererRef.current;
        if (!embedded?.reader || !renderer || state.viewedAreaId === null) return;

        renderer.drawArea(state.viewedAreaId, level);

        const area = embedded.reader.getArea?.(state.viewedAreaId);
        const rooms = area?.getRooms?.() ?? [];
        const roomsAtLevel = rooms.filter((r: any) => r.z === level);

        if (roomsAtLevel.length > 0) {
            let sumX = 0, sumY = 0;
            for (const room of roomsAtLevel) {
                sumX += room.x;
                sumY += room.y;
            }
            const avgX = sumX / roomsAtLevel.length;
            const avgY = sumY / roomsAtLevel.length;
            let closestRoom = roomsAtLevel[0];
            let minDist = Infinity;
            for (const room of roomsAtLevel) {
                const dist = Math.abs(room.x - avgX) + Math.abs(room.y - avgY);
                if (dist < minDist) {
                    minDist = dist;
                    closestRoom = room;
                }
            }
            renderer.setPosition(closestRoom.id);
        }

        // Update player marker to actual position (will hide if not on this area/level)
        const actualPlayerRoom = embedded.currentRoom;
        if (actualPlayerRoom) {
            renderer.updatePositionMarker(actualPlayerRoom);
        }

        setState(currentState => {
            // Check if this is the initial level on initial area
            const initialRoom = currentState.initialHighlightRoom !== null
                ? embedded.reader.getRoom(currentState.initialHighlightRoom)
                : null;
            const isInitialLevel = initialRoom &&
                initialRoom.area === state.viewedAreaId &&
                initialRoom.z === level;

            return {
                ...currentState,
                viewedLevel: level,
                // Only show room number if viewing initial area and level
                titleRoomId: isInitialLevel ? currentState.initialHighlightRoom : null,
            };
        });
        renderPathsAndHighlights();
        closeMenu();
    }, [getEmbedded, rendererRef, state.viewedAreaId, setState, renderPathsAndHighlights, closeMenu]);

    const handleZoomIn = useCallback(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        const newZoom = renderer.getZoom() * 1.2;
        renderer.zoomToCenter(newZoom);
        setState(s => ({ ...s, zoom: newZoom }));
        closeMenu();
    }, [rendererRef, setState, closeMenu]);

    const handleZoomOut = useCallback(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
        const newZoom = renderer.getZoom() / 1.2;
        renderer.zoomToCenter(newZoom);
        setState(s => ({ ...s, zoom: newZoom }));
        closeMenu();
    }, [rendererRef, setState, closeMenu]);

    const handleCenterOnPlayer = useCallback(() => {
        const embedded = getEmbedded();
        const renderer = rendererRef.current;
        if (!embedded?.reader || !renderer || !embedded.currentRoom) return;

        const room = embedded.reader.getRoom(embedded.currentRoom);
        if (!room) return;

        renderer.drawArea(room.area, room.z);
        renderer.setPosition(embedded.currentRoom);
        // Ensure player marker is shown after area change
        renderer.updatePositionMarker(embedded.currentRoom);

        const area = embedded.reader.getArea?.(room.area);
        const areaName = area?.getAreaName?.() ?? area?.areaName ?? `Obszar ${room.area}`;

        setState(s => {
            // Check if centering on player brings us back to initial room
            const isInitialRoom = s.initialHighlightRoom !== null &&
                s.initialHighlightRoom === embedded.currentRoom;

            return {
                ...s,
                viewedAreaId: room.area,
                viewedLevel: room.z,
                currentRoom: embedded.currentRoom,
                titleRoomId: isInitialRoom ? s.initialHighlightRoom : null,
                titleAreaName: areaName,
            };
        });
        loadLevels(room.area);
        renderPathsAndHighlights();
        closeMenu();
    }, [getEmbedded, rendererRef, setState, loadLevels, renderPathsAndHighlights, closeMenu]);

    const handleBackToMenu = useCallback(() => setSubmenu('none'), []);

    const handleToggleFollow = useCallback(() => {
        setState(s => ({ ...s, followPlayer: !s.followPlayer }));
        closeMenu();
    }, [setState, closeMenu]);

    const handleToggleGrid = useCallback(() => {
        const newValue = !state.showGrid;
        const embedded = getEmbedded();
        if (embedded?.settings) embedded.settings.gridEnabled = newValue;
        setBuiltInPanelSetting('map', 'showGrid', newValue);
        eventBus.emit('mapShowGrid', newValue);
        rendererRef.current?.refresh();
        setState(s => ({ ...s, showGrid: newValue }));
        closeMenu();
    }, [state.showGrid, getEmbedded, rendererRef, setState, closeMenu]);

    const handleToggleAreaExitLabels = useCallback(() => {
        const newValue = !state.showAreaExitLabels;
        const embedded = getEmbedded();
        if (embedded?.settings) embedded.settings.areaExitLabels = newValue;
        setBuiltInPanelSetting('map', 'showAreaExitLabels', newValue);
        eventBus.emit('mapShowAreaExitLabels', newValue);
        rendererRef.current?.refresh();
        setState(s => ({ ...s, showAreaExitLabels: newValue }));
        closeMenu();
    }, [state.showAreaExitLabels, getEmbedded, rendererRef, setState, closeMenu]);

    return (
        <div ref={menuRef} className="map-header-menu">
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
                <div className="map-header-menu__dropdown" style={dropdownStyle ?? undefined}>
                    {submenu === 'areas' ? (
                        <>
                            <button type="button" className="map-header-menu__item map-header-menu__item--back" onClick={handleBackToMenu}>
                                &larr; Powrot
                            </button>
                            <div className="map-header-menu__area-list" style={dropdownStyle?.maxHeight ? { maxHeight: (dropdownStyle.maxHeight as number) - 40 } : undefined}>
                                {areas.map((area) => (
                                    <button
                                        key={area.id}
                                        type="button"
                                        className={`map-header-menu__item${area.id === state.viewedAreaId ? ' map-header-menu__item--active' : ''}`}
                                        onClick={() => handleSelectArea(area.id)}
                                    >
                                        {area.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : submenu === 'levels' ? (
                        <>
                            <button type="button" className="map-header-menu__item map-header-menu__item--back" onClick={handleBackToMenu}>
                                &larr; Powrot
                            </button>
                            <div className="map-header-menu__area-list" style={dropdownStyle?.maxHeight ? { maxHeight: (dropdownStyle.maxHeight as number) - 40 } : undefined}>
                                {levels.map((level) => (
                                    <button
                                        key={level}
                                        type="button"
                                        className={`map-header-menu__item${level === state.viewedLevel ? ' map-header-menu__item--active' : ''}`}
                                        onClick={() => handleSelectLevel(level)}
                                    >
                                        Poziom {level}
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <button type="button" className="map-header-menu__item" onClick={handleShowAreas}>Zmien obszar</button>
                            <button type="button" className="map-header-menu__item" onClick={handleShowLevels} disabled={state.viewedAreaId === null}>Zmien poziom</button>
                            <div className="map-header-menu__zoom-row">
                                <button type="button" className="map-header-menu__item" onClick={handleZoomIn}>Zbliz</button>
                                <button type="button" className="map-header-menu__item" onClick={handleZoomOut}>Oddal</button>
                            </div>
                            <button type="button" className="map-header-menu__item" onClick={handleCenterOnPlayer}>Idz do gracza</button>
                            <button
                                type="button"
                                className="map-header-menu__item map-header-menu__item--checkbox"
                                onClick={handleToggleFollow}
                            >
                                <span className={`map-header-menu__checkbox${state.followPlayer ? ' map-header-menu__checkbox--checked' : ''}`} />
                                Sledz gracza
                            </button>
                            <button
                                type="button"
                                className="map-header-menu__item map-header-menu__item--checkbox"
                                onClick={handleToggleGrid}
                            >
                                <span className={`map-header-menu__checkbox${state.showGrid ? ' map-header-menu__checkbox--checked' : ''}`} />
                                Siatka
                            </button>
                            <button
                                type="button"
                                className="map-header-menu__item map-header-menu__item--checkbox"
                                onClick={handleToggleAreaExitLabels}
                            >
                                <span className={`map-header-menu__checkbox${state.showAreaExitLabels ? ' map-header-menu__checkbox--checked' : ''}`} />
                                Etykiety wyjsc obszaru
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function StaticMapWindow({ instance, onClose }: { instance: StaticMapInstance; onClose: () => void }) {
    const popupId = `popup:staticmap:${instance.id}`;

    const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
    const rendererRef = useRef<MapRenderer | null>(null);
    const [isOpen, setIsOpen] = useState(true);
    const [isPinned, setIsPinned] = useState(() => shouldPopupAutoOpen(popupId));
    const [isLocked, setIsLocked] = useState(() => getPopupLockedState(popupId));
    const [state, setState] = useState<StaticMapState>({
        viewedAreaId: null,
        viewedLevel: 0,
        zoom: 0.30,
        currentRoom: null,
        initialHighlightRoom: null,
        titleRoomId: null,
        titleAreaName: '',
        followPlayer: false,
        showGrid: (globalThis as any).embedded?.settings?.gridEnabled ?? false,
        showAreaExitLabels: (globalThis as any).embedded?.settings?.areaExitLabels ?? true,
    });
    const [note, setNote] = useState<LocationNote | null>(null);
    const [mapNote, setMapNote] = useState<string | null>(null);
    const [pluginNotes, setPluginNotes] = useState<PluginLocationNote[]>([]);

    const currentPathRef = useRef<{ segments: Array<{ path: number[]; color: string }> } | null>(null);
    const currentHighlightsRef = useRef<{ roomId: number; color: string }[]>([]);
    const initialHighlightRoomRef = useRef<number | null>(null);
    const followPlayerRef = useRef(false);

    // Keep ref in sync with state
    followPlayerRef.current = state.followPlayer;

    const getEmbedded = useCallback(() => (globalThis as any).embedded, []);

    const renderPathsAndHighlights = useCallback(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;

        renderer.clearPaths();
        if (currentPathRef.current) {
            for (const segment of currentPathRef.current.segments) {
                renderer.renderPath(segment.path, segment.color);
            }
        }

        renderer.clearHighlights();
        // Always render the initial highlight room first (if set)
        if (initialHighlightRoomRef.current !== null) {
            renderer.renderHighlight(initialHighlightRoomRef.current, '#ffcc00');
        }
        currentHighlightsRef.current.forEach(({ roomId, color }) => {
            renderer.renderHighlight(roomId, color);
        });
    }, []);

    const loadLevels = useCallback((areaId: number) => {
        const embedded = getEmbedded();
        if (!embedded?.reader) return;

        if (!levelsCache.has(areaId)) {
            const area = embedded.reader.getArea?.(areaId);
            const rooms = area?.getRooms?.() ?? [];
            const levelSet = new Set<number>();
            for (const room of rooms) {
                levelSet.add(room.z);
            }
            const sortedLevels = Array.from(levelSet).sort((a, b) => b - a);
            levelsCache.set(areaId, sortedLevels);
        }
    }, [getEmbedded]);

    // Initialize renderer when popup opens
    useEffect(() => {
        if (!isOpen || !containerEl) return;

        const embedded = getEmbedded();
        if (!embedded?.reader) return;

        const parentContainer = containerEl;
        let container: HTMLDivElement | null = null;
        let pathHandler: ((data: { segments: Array<{ path: number[]; color: string }> } | null) => void) | null = null;
        let highlightHandler: ((data: { roomId: number; color: string }[]) => void) | null = null;
        let moveHandler: ((ev: { id: number }) => void) | null = null;
        let contextMenuHandler: ((ev: Event) => void) | null = null;
        let roomClickHandler: ((ev: Event) => void) | null = null;
        let areaExitClickHandler: ((ev: Event) => void) | null = null;
        let zoomHandler: (() => void) | null = null;
        let settingsHandler: (() => void) | null = null;
        let settingsUnsubscribe: (() => void) | null = null;
        let gridHandler: ((value: boolean) => void) | null = null;
        let areaExitLabelsHandler: ((value: boolean) => void) | null = null;
        let dataChangedHandler: (() => void) | null = null;

        const initTimeout = requestAnimationFrame(() => {
            if (!parentContainer) return;

            container = document.createElement('div');
            container.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;';
            container.style.touchAction = 'none';
            parentContainer.appendChild(container);

            const renderer = new MapRenderer(embedded.reader, embedded.settings, container);
            rendererRef.current = renderer;

            renderer.centerOnResize = false;
            renderer.setZoom(0.30);

            const actualPlayerRoom = embedded.currentRoom;

            // Handle opening by area ID (no specific room)
            if (instance.initialAreaId && !instance.initialRoomId) {
                const areaId = instance.initialAreaId;
                const area = embedded.reader.getArea?.(areaId);
                const areaName = area?.getAreaName?.() ?? area?.areaName ?? `Obszar ${areaId}`;
                const rooms = area?.getRooms?.() ?? [];

                renderer.drawArea(areaId, 0);

                // Center on area center (average position of rooms at level 0)
                const roomsAtLevel = rooms.filter((r: any) => r.z === 0);
                if (roomsAtLevel.length > 0) {
                    let sumX = 0, sumY = 0;
                    for (const room of roomsAtLevel) {
                        sumX += room.x;
                        sumY += room.y;
                    }
                    const avgX = sumX / roomsAtLevel.length;
                    const avgY = sumY / roomsAtLevel.length;
                    // Find room closest to center
                    let closestRoom = roomsAtLevel[0];
                    let minDist = Infinity;
                    for (const room of roomsAtLevel) {
                        const dist = Math.abs(room.x - avgX) + Math.abs(room.y - avgY);
                        if (dist < minDist) {
                            minDist = dist;
                            closestRoom = room;
                        }
                    }
                    renderer.setPosition(closestRoom.id); // Center on this room
                }

                // Show player marker only if the player is in this area/level
                const playerRoomObj = actualPlayerRoom
                    ? embedded.reader.getRoom(actualPlayerRoom)
                    : null;
                if (playerRoomObj && playerRoomObj.area === areaId && playerRoomObj.z === 0) {
                    renderer.updatePositionMarker(actualPlayerRoom);
                } else {
                    renderer.clearPosition();
                }

                setState(s => ({
                    ...s,
                    viewedAreaId: areaId,
                    viewedLevel: 0,
                    currentRoom: actualPlayerRoom ?? null,
                    initialHighlightRoom: null,
                    titleRoomId: null,
                    titleAreaName: areaName,
                }));

                // Cache levels
                if (!levelsCache.has(areaId)) {
                    const levelSet = new Set<number>();
                    for (const r of rooms) levelSet.add(r.z);
                    const sortedLevels = Array.from(levelSet).sort((a, b) => b - a);
                    levelsCache.set(areaId, sortedLevels);
                }
            } else {
                // Handle opening by room ID
                let initialRoom = instance.initialRoomId;
                if (!initialRoom && actualPlayerRoom) {
                    initialRoom = actualPlayerRoom;
                }

                if (initialRoom) {
                    const room = embedded.reader.getRoom(initialRoom);
                    if (room) {
                        renderer.drawArea(room.area, room.z);
                        // Center on the requested room
                        renderer.setPosition(initialRoom);
                        // Highlight the requested room and store it for persistence
                        initialHighlightRoomRef.current = initialRoom;
                        renderer.renderHighlight(initialRoom, '#ffcc00');

                        // Show the player marker only if the player is in the viewed area/level;
                        // otherwise clear it so it doesn't render at stale coordinates.
                        const playerRoomObj = actualPlayerRoom
                            ? embedded.reader.getRoom(actualPlayerRoom)
                            : null;
                        const playerInViewedArea = !!playerRoomObj
                            && playerRoomObj.area === room.area
                            && playerRoomObj.z === room.z;
                        if (playerInViewedArea && actualPlayerRoom !== initialRoom) {
                            renderer.updatePositionMarker(actualPlayerRoom);
                        } else if (!playerInViewedArea) {
                            renderer.clearPosition();
                        }

                        // Get area name for title
                        const area = embedded.reader.getArea?.(room.area);
                        const areaName = area?.getAreaName?.() ?? area?.areaName ?? `Obszar ${room.area}`;

                        setState(s => ({
                            ...s,
                            viewedAreaId: room.area,
                            viewedLevel: room.z,
                            currentRoom: actualPlayerRoom ?? initialRoom!,
                            initialHighlightRoom: initialRoom!,
                            titleRoomId: initialRoom!,
                            titleAreaName: areaName,
                        }));

                        // Load notes for the highlighted room
                        const roomMapNote = (room as any).userData?.note ?? null;
                        setMapNote(roomMapNote);
                        getNote(initialRoom).then(setNote);
                        setPluginNotes(getPluginLocationNotes(initialRoom));

                        // Cache levels
                        if (!levelsCache.has(room.area)) {
                            const rooms = area?.getRooms?.() ?? [];
                            const levelSet = new Set<number>();
                            for (const r of rooms) levelSet.add(r.z);
                            const sortedLevels = Array.from(levelSet).sort((a, b) => b - a);
                            levelsCache.set(room.area, sortedLevels);
                        }
                    }
                }
            }

            pathHandler = (data: { segments: Array<{ path: number[]; color: string }> } | null) => {
                currentPathRef.current = data;
                renderPathsAndHighlights();
            };

            highlightHandler = (data: { roomId: number; color: string }[]) => {
                currentHighlightsRef.current = data;
                renderPathsAndHighlights();
            };

            moveHandler = (ev: { id: number }) => {
                const renderer = rendererRef.current;
                const embedded = getEmbedded();
                if (!renderer || !embedded?.reader) return;

                if (followPlayerRef.current) {
                    // Follow mode: switch area/level if needed and center on player
                    const room = embedded.reader.getRoom(ev.id);
                    if (room) {
                        renderer.drawArea(room.area, room.z);
                        renderer.setPosition(ev.id);

                        const area = embedded.reader.getArea?.(room.area);
                        const areaName = area?.getAreaName?.() ?? area?.areaName ?? `Obszar ${room.area}`;

                        setState(currentState => ({
                            ...currentState,
                            viewedAreaId: room.area,
                            viewedLevel: room.z,
                            currentRoom: ev.id,
                            titleRoomId: null,
                            titleAreaName: areaName,
                        }));
                        loadLevels(room.area);
                        renderPathsAndHighlights();
                    }
                } else {
                    // Static mode: only show the marker if the player's new room is in the viewed area/level
                    const newRoom = embedded.reader.getRoom(ev.id);
                    setState(currentState => {
                        if (newRoom
                            && newRoom.area === currentState.viewedAreaId
                            && newRoom.z === currentState.viewedLevel) {
                            renderer.updatePositionMarker(ev.id);
                        } else {
                            renderer.clearPosition();
                        }
                        return { ...currentState, currentRoom: ev.id };
                    });
                }
            };

            const navigateToRoom = (roomId: number) => {
                const renderer = rendererRef.current;
                const embedded = getEmbedded();
                if (!renderer || !embedded?.reader) return;

                const room = embedded.reader.getRoom(roomId);
                if (!room) return;

                renderer.drawArea(room.area, room.z);
                renderer.setPosition(roomId);

                initialHighlightRoomRef.current = roomId;
                renderer.clearHighlights();
                renderer.renderHighlight(roomId, '#ffcc00');

                const actualPlayerRoom = embedded.currentRoom;
                const actualPlayerRoomObj = actualPlayerRoom
                    ? embedded.reader.getRoom(actualPlayerRoom)
                    : null;
                const playerInViewedArea = !!actualPlayerRoomObj
                    && actualPlayerRoomObj.area === room.area
                    && actualPlayerRoomObj.z === room.z;
                if (playerInViewedArea && actualPlayerRoom !== roomId) {
                    renderer.updatePositionMarker(actualPlayerRoom);
                } else if (!playerInViewedArea) {
                    renderer.clearPosition();
                }

                const area = embedded.reader.getArea?.(room.area);
                const areaName = area?.getAreaName?.() ?? area?.areaName ?? `Obszar ${room.area}`;

                setState(s => ({
                    ...s,
                    viewedAreaId: room.area,
                    viewedLevel: room.z,
                    initialHighlightRoom: roomId,
                    titleRoomId: roomId,
                    titleAreaName: areaName,
                }));

                const roomMapNote = (room as any).userData?.note ?? null;
                setMapNote(roomMapNote);
                getNote(roomId).then(setNote);
                setPluginNotes(getPluginLocationNotes(roomId));

                loadLevels(room.area);
                renderPathsAndHighlights();
            };

            const containerForMenu = container;
            contextMenuHandler = (ev: Event) => {
                const customEv = ev as CustomEvent<RoomContextMenuEventDetail>;
                customEv.preventDefault();
                const room = customEv.detail.roomId;
                if (room && containerForMenu) {
                    const rect = containerForMenu.getBoundingClientRect();
                    const viewportX = customEv.detail.position.x + rect.left;
                    const viewportY = customEv.detail.position.y + rect.top;
                    openMapContextMenu(room, viewportX, viewportY, [
                        {
                            label: 'Pokaz w tym oknie',
                            action: () => navigateToRoom(room),
                        },
                    ]);
                }
            };

            roomClickHandler = (ev: Event) => {
                const customEv = ev as CustomEvent<RoomClickEventDetail>;
                const room = customEv.detail.roomId;
                if (room && containerForMenu) {
                    const rect = containerForMenu.getBoundingClientRect();
                    const viewportX = customEv.detail.position.x + rect.left;
                    const viewportY = customEv.detail.position.y + rect.top;
                    const embedded = getEmbedded();
                    const mapNote = embedded?.reader?.getRoom(room)?.userData?.note;
                    showMapNoteTooltipForRoom(room, viewportX, viewportY, mapNote);
                }
            };

            areaExitClickHandler = (ev: Event) => {
                const customEv = ev as CustomEvent<AreaExitClickEventDetail>;
                const targetRoomId = customEv.detail.targetRoomId;
                if (typeof targetRoomId === 'number') {
                    navigateToRoom(targetRoomId);
                }
            };

            zoomHandler = () => {
                if (rendererRef.current) {
                    const newZoom = rendererRef.current.getZoom();
                    setState(s => ({ ...s, zoom: newZoom }));
                }
            };

            // Listen for map settings changes to refresh renderer without centering
            settingsHandler = () => {
                const renderer = rendererRef.current;
                const embedded = getEmbedded();
                if (!renderer || !embedded) return;

                // Use state values for current view
                setState(currentState => {
                    if (currentState.viewedAreaId !== null) {
                        // Redraw area (this preserves stage position)
                        renderer.drawArea(currentState.viewedAreaId, currentState.viewedLevel);

                        // Update player marker without centering
                        if (embedded.currentRoom) {
                            renderer.updatePositionMarker(embedded.currentRoom);
                        }

                        // Re-render paths and highlights
                        renderPathsAndHighlights();
                    }
                    return currentState; // Don't change state
                });
            };

            gridHandler = (value: boolean) => {
                const renderer = rendererRef.current;
                if (!renderer) return;
                const embedded = getEmbedded();
                if (embedded?.settings) embedded.settings.gridEnabled = value;
                renderer.refresh();
                setState(s => ({ ...s, showGrid: value }));
            };

            areaExitLabelsHandler = (value: boolean) => {
                const renderer = rendererRef.current;
                if (!renderer) return;
                const embedded = getEmbedded();
                if (embedded?.settings) embedded.settings.areaExitLabels = value;
                renderer.refresh();
                setState(s => ({ ...s, showAreaExitLabels: value }));
            };

            dataChangedHandler = () => {
                const renderer = rendererRef.current;
                const embedded = getEmbedded();
                if (!renderer || !embedded) return;

                levelsCache.clear();
                setState(currentState => {
                    if (currentState.viewedAreaId !== null) {
                        renderer.drawArea(currentState.viewedAreaId, currentState.viewedLevel);
                        if (embedded.currentRoom) {
                            renderer.updatePositionMarker(embedded.currentRoom);
                        }
                        renderPathsAndHighlights();
                    }
                    return currentState;
                });
            };

            eventBus.on('mapPath', pathHandler);
            eventBus.on('mapHighlights', highlightHandler);
            eventBus.on('enterLocation', moveHandler);
            settingsUnsubscribe = globalStorage.onChange('uiSettings', settingsHandler);
            eventBus.on('mapShowGrid', gridHandler);
            eventBus.on('mapShowAreaExitLabels', areaExitLabelsHandler);
            eventBus.on('mapDataChanged', dataChangedHandler);
            container.addEventListener('roomcontextmenu', contextMenuHandler);
            container.addEventListener('roomclick', roomClickHandler);
            container.addEventListener('areaexitclick', areaExitClickHandler);
            container.addEventListener('zoom', zoomHandler);

            const resizeObserver = new ResizeObserver(() => {
                container?.dispatchEvent(new Event('resize'));
            });
            resizeObserver.observe(parentContainer);

            eventBus.emit('requestMapHighlights');
            eventBus.emit('requestMapPath');
            renderPathsAndHighlights();

            (container as any).__resizeObserver = resizeObserver;
        });

        return () => {
            cancelAnimationFrame(initTimeout);
            if (pathHandler) eventBus.off('mapPath', pathHandler);
            if (highlightHandler) eventBus.off('mapHighlights', highlightHandler);
            if (moveHandler) eventBus.off('enterLocation', moveHandler);
            if (settingsUnsubscribe) settingsUnsubscribe();
            if (gridHandler) eventBus.off('mapShowGrid', gridHandler);
            if (areaExitLabelsHandler) eventBus.off('mapShowAreaExitLabels', areaExitLabelsHandler);
            if (dataChangedHandler) eventBus.off('mapDataChanged', dataChangedHandler);
            if (container && contextMenuHandler) {
                container.removeEventListener('roomcontextmenu', contextMenuHandler);
            }
            if (container && roomClickHandler) {
                container.removeEventListener('roomclick', roomClickHandler);
            }
            if (container && areaExitClickHandler) {
                container.removeEventListener('areaexitclick', areaExitClickHandler);
            }
            if (container && zoomHandler) {
                container.removeEventListener('zoom', zoomHandler);
            }
            if (container) {
                const resizeObserver = (container as any).__resizeObserver;
                if (resizeObserver) resizeObserver.disconnect();
                container.remove();
            }
            const renderer = rendererRef.current;
            renderer?.destroy();
            rendererRef.current = null;
        };
    }, [isOpen, containerEl, getEmbedded, instance.initialRoomId, instance.initialAreaId, renderPathsAndHighlights, loadLevels]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        onClose();
    }, [onClose]);

    const handleCopyAsImage = useCallback(async () => {
        const container = containerEl;
        if (!container) return;

        // Konva creates multiple canvas layers - we need to composite them all
        const canvases = container.querySelectorAll('canvas');
        if (canvases.length === 0) return;

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

            await copyCanvasToClipboard(compositeCanvas);
        } catch (err) {
            console.error('Failed to copy map as image:', err);
        }
    }, [containerEl]);

    if (!isOpen) return null;

    const headerActions = (
        <>
            <button
                type="button"
                className="static-map-popup__image-btn"
                onClick={handleCopyAsImage}
                title="Kopiuj jako obraz"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
            </button>
            <StaticMapMenu
                rendererRef={rendererRef}
                state={state}
                setState={setState}
                loadLevels={loadLevels}
                renderPathsAndHighlights={renderPathsAndHighlights}
            />
        </>
    );

    // Build title: "Mapa #roomId areaName" or "Mapa areaName" or fallback
    const title = state.titleRoomId
        ? `Mapa #${state.titleRoomId} ${state.titleAreaName}`
        : state.titleAreaName
            ? `Mapa ${state.titleAreaName}`
            : `Mapa #${instance.id.slice(-4)}`;

    const hasNotes = note || mapNote || pluginNotes.length > 0;

    return (
        <DockablePopupWrapper
            popupId={popupId}
            popupType="staticmap"
            title={title}
            isOpen={isOpen}
            isPinned={isPinned}
            isLocked={isLocked}
            onClose={handleClose}
            onPinnedChange={setIsPinned}
            onLockedChange={setIsLocked}
            minWidth={250}
            minHeight={200}
            initialWidth={600}
            initialHeight={525}
            className="static-map-popup"
            bodyClassName="static-map-popup-body"
            headerActions={headerActions}
        >
            <div className="static-map-popup__map" ref={setContainerEl}>
                {hasNotes && (
                    <div className="static-map-popup__notes">
                        {mapNote && <div>{mapNote}</div>}
                        {mapNote && (note || pluginNotes.length > 0) && <hr />}
                        {note && <div>{note.note}</div>}
                        {note && pluginNotes.length > 0 && <hr />}
                        {pluginNotes.map((pn, idx) => (
                            <div key={`${pn.pluginId}-${idx}`}>{pn.note}</div>
                        ))}
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
}

const STATIC_MAP_POPUP_PREFIX = 'popup:staticmap:';

const StaticMapPopupManager: React.FC = () => {
    const [instances, setInstances] = useState<StaticMapInstance[]>([]);
    const restoredRef = useRef(false);

    // Restore pinned/docked static map windows on mount
    useEffect(() => {
        if (restoredRef.current) return;
        restoredRef.current = true;

        const pinnedPopupIds = getPinnedPopupsByPrefix(STATIC_MAP_POPUP_PREFIX);
        if (pinnedPopupIds.length === 0) return;

        const restoredInstances: StaticMapInstance[] = [];
        for (const popupId of pinnedPopupIds) {
            const id = popupId.replace(STATIC_MAP_POPUP_PREFIX, '');
            const initialRoomId = getPopupSetting<number | undefined>(popupId, 'initialRoomId', undefined);
            const initialAreaId = getPopupSetting<number | undefined>(popupId, 'initialAreaId', undefined);
            restoredInstances.push({ id, initialRoomId, initialAreaId });
        }

        if (restoredInstances.length > 0) {
            setInstances(restoredInstances);
        }
    }, []);

    useEffect(() => {
        const handler = (payload: { roomId?: number; areaId?: number; instanceId?: string }) => {
            const id = payload?.instanceId || Date.now().toString(36);
            const popupId = `${STATIC_MAP_POPUP_PREFIX}${id}`;

            // Save init params for persistence
            if (payload?.roomId !== undefined) {
                setPopupSetting(popupId, 'initialRoomId', payload.roomId);
            }
            if (payload?.areaId !== undefined) {
                setPopupSetting(popupId, 'initialAreaId', payload.areaId);
            }

            setInstances(prev => [...prev, { id, initialRoomId: payload?.roomId, initialAreaId: payload?.areaId }]);
        };

        eventBus.on('staticmap.popup.open', handler);
        return () => {
            eventBus.off('staticmap.popup.open', handler);
        };
    }, []);

    const handleClose = useCallback((id: string) => {
        setInstances(prev => prev.filter(inst => inst.id !== id));
    }, []);

    return (
        <>
            {instances.map(instance => (
                <StaticMapWindow
                    key={instance.id}
                    instance={instance}
                    onClose={() => handleClose(instance.id)}
                />
            ))}
        </>
    );
};

export default StaticMapPopupManager;
