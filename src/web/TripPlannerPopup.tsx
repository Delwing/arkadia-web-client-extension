import React, { useCallback, useEffect, useState, useMemo } from 'react';
import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { SEGMENT_COLORS } from '@shared/map/MapHelper';
import { getMapDestinations } from '@modules/core/mapDestinationsProvider';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    type Modifier,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ShortcutEntry {
    key: string;
    id: number;
    label: string;
}

interface TripStop {
    id: number;
    name?: string;
    uid: string;
}

interface SavedRoute {
    name: string;
    stops: { id: number; name?: string }[];
}

interface SortableStopProps {
    stop: TripStop;
    index: number;
    isUnreachable: boolean;
    distance: number | null;
    color: string;
    onRemove: (uid: string) => void;
}

const restrictToVerticalAxis: Modifier = ({ transform }) => ({
    ...transform,
    x: 0,
});

const restrictToParentElement: Modifier = ({ draggingNodeRect, containerNodeRect, transform }) => {
    if (!draggingNodeRect || !containerNodeRect) return transform;
    const clampedY = Math.min(
        Math.max(transform.y, containerNodeRect.top - draggingNodeRect.top),
        containerNodeRect.top + containerNodeRect.height - draggingNodeRect.top - draggingNodeRect.height,
    );
    return { ...transform, x: 0, y: clampedY };
};

const dndModifiers = [restrictToVerticalAxis, restrictToParentElement];

const ROUTES_STORAGE_KEY = 'tripRoutes';

function loadRoutesFromStorage(): SavedRoute[] {
    try {
        const raw = localStorage.getItem(ROUTES_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch {
        // ignore parse errors
    }
    return [];
}

function saveRoutesToStorage(routes: SavedRoute[]) {
    localStorage.setItem(ROUTES_STORAGE_KEY, JSON.stringify(routes));
    // Dispatch event to notify other windows/tabs and trigger sync
    window.dispatchEvent(new CustomEvent('deviceSettingsChanged'));
}

function getEmbedded() {
    return (globalThis as any).embedded;
}

function getCurrentRoomId(): number | null {
    const embedded = getEmbedded();
    const room = embedded?.currentRoom;
    return typeof room === 'number' ? room : null;
}

function canReach(fromId: number | null, toId: number): boolean {
    if (fromId === null) return true; // Can't check without current location - assume reachable
    if (fromId === toId) return true; // Same location
    const embedded = getEmbedded();
    if (!embedded?.pathFinder?.findPath) return true; // Can't check - assume reachable
    try {
        const path = embedded.pathFinder.findPath(fromId, toId);
        // findPath returns null/undefined or empty array when no path exists
        return path && path.length > 0;
    } catch {
        return true; // Error - assume reachable
    }
}

function getRoomName(roomId: number): string | undefined {
    const embedded = getEmbedded();
    if (!embedded?.reader) return undefined;
    const room = embedded.reader.getRoom(roomId);
    if (!room) return undefined;
    const name = room.name;
    if (name && name !== String(roomId)) {
        return name;
    }
    return undefined;
}

function getDistance(fromId: number | null, toId: number): number | null {
    if (fromId === null) return null;
    if (fromId === toId) return 0;
    const embedded = getEmbedded();
    if (!embedded?.pathFinder) return null;
    try {
        const path = embedded.pathFinder.findPath(fromId, toId);
        return path && path.length > 0 ? path.length - 1 : null;
    } catch {
        return null;
    }
}

function SortableStop({ stop, index, isUnreachable, distance, color, onRemove }: SortableStopProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: stop.uid });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <div
            ref={setNodeRef}
            className={`trip-planner-stop${isUnreachable ? ' trip-planner-stop--unreachable' : ''}`}
            style={style}
        >
            <span
                className="trip-planner-stop-color"
                style={{ backgroundColor: color }}
                title="Kolor segmentu na mapie"
            />
            <span
                {...attributes}
                {...listeners}
                className="trip-planner-stop-handle"
                title="Przeciagnij aby zmienic kolejnosc"
            >
                &#x2630;
            </span>
            <span className="trip-planner-stop-number">{index + 1}.</span>
            <span className="trip-planner-stop-id">#{stop.id}</span>
            {stop.name && (
                <span className="trip-planner-stop-name">{stop.name}</span>
            )}
            {distance !== null && (
                <span className="trip-planner-stop-distance" title="Odleglosc od poprzedniego przystanku">
                    {distance}
                </span>
            )}
            {isUnreachable && (
                <span className="trip-planner-stop-warning" title="Brak sciezki do tego przystanku">
                    &#x26A0;
                </span>
            )}
            <button
                type="button"
                className="trip-planner-stop-remove"
                onClick={() => onRemove(stop.uid)}
                title="Usun przystanek"
            >
                &times;
            </button>
        </div>
    );
}

const POPUP_ID = 'popup:tripPlanner';
let uidCounter = 0;

const TripPlannerPopup: React.FC = () => {
    const [stops, setStops] = useState<TripStop[]>([]);
    const [shortcuts, setShortcuts] = useState<ShortcutEntry[]>([]);
    const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
    const [inputMode, setInputMode] = useState<'id' | 'shortcut'>('id');
    const [idInput, setIdInput] = useState('');
    const [selectedShortcut, setSelectedShortcut] = useState('');
    const [routeName, setRouteName] = useState('');
    const [selectedRoute, setSelectedRoute] = useState('');
    const [currentRoomId, setCurrentRoomId] = useState<number | null>(getCurrentRoomId());

    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'tripPlanner.popup.open',
    });

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Update current room when location changes — only while popup is open
    useEffect(() => {
        if (!isOpen) return;
        const handleEnterLocation = (payload: { id: number }) => {
            setCurrentRoomId(payload.id);
        };
        return eventBus.on('enterLocation', handleEnterLocation);
    }, [isOpen]);

    // Refresh current room ID and populate stops from active destinations when popup opens
    useEffect(() => {
        if (wrapperProps.isOpen) {
            const roomId = getCurrentRoomId();
            if (roomId !== null) {
                setCurrentRoomId(roomId);
            }
            // If stops are empty but there are active destinations (from /prowadz), populate
            setStops(prev => {
                if (prev.length > 0) return prev;
                const destinations = getMapDestinations();
                if (destinations.length === 0) return prev;
                return destinations.map(id => ({
                    id,
                    name: getRoomName(id),
                    uid: `stop-${++uidCounter}`,
                }));
            });
        }
    }, [wrapperProps.isOpen]);

    // Handle adding stop from context menu
    useEffect(() => {
        const handleAddStop = (payload: { roomId: number }) => {
            const id = payload.roomId;
            const name = getRoomName(id);
            setStops(prev => [...prev, { id, name, uid: `stop-${++uidCounter}` }]);
            // Open the popup if it's not already open
            eventBus.emit('tripPlanner.popup.open');
        };
        return eventBus.on('tripPlanner.addStop', handleAddStop);
    }, []);

    // Load shortcuts
    useEffect(() => {
        const saved = globalStorage.get('shortcuts') as any;
        const arr = Array.isArray(saved) ? saved : [];
        setShortcuts(arr);
    }, []);

    // Load saved routes
    useEffect(() => {
        setSavedRoutes(loadRoutesFromStorage());
    }, []);

    // Listen for storage changes (from other tabs or sync)
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === ROUTES_STORAGE_KEY) {
                setSavedRoutes(loadRoutesFromStorage());
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    useEffect(() => {
        return globalStorage.onChange('shortcuts', (newValue) => {
            const arr = newValue ? (Array.isArray(newValue) ? newValue : Object.values(newValue)) : [];
            setShortcuts(arr);
        });
    }, []);

    // Calculate reachability and distances for each stop
    const { unreachableStops, stopDistances, totalDistance } = useMemo(() => {
        const unreachable = new Set<string>();
        const distances = new Map<string, number | null>();
        let total = 0;
        let prevId = currentRoomId;
        for (const stop of stops) {
            const reachable = canReach(prevId, stop.id);
            const dist = getDistance(prevId, stop.id);
            distances.set(stop.uid, dist);
            if (dist !== null) {
                total += dist;
            }
            if (!reachable) {
                unreachable.add(stop.uid);
            }
            prevId = stop.id;
        }
        return { unreachableStops: unreachable, stopDistances: distances, totalDistance: total };
    }, [stops, currentRoomId]);

    const persistRoutes = useCallback((routes: SavedRoute[]) => {
        saveRoutesToStorage(routes);
    }, []);

    const addStopById = useCallback(() => {
        const id = parseInt(idInput, 10);
        if (isNaN(id) || id <= 0) return;
        const name = getRoomName(id);
        setStops(prev => [...prev, { id, name, uid: `stop-${++uidCounter}` }]);
        setIdInput('');
    }, [idInput]);

    const addStopByShortcut = useCallback(() => {
        if (!selectedShortcut) return;
        const shortcut = shortcuts.find(s => s.key === selectedShortcut);
        if (!shortcut) return;
        setStops(prev => [...prev, { id: shortcut.id, name: shortcut.label || shortcut.key, uid: `stop-${++uidCounter}` }]);
        setSelectedShortcut('');
    }, [selectedShortcut, shortcuts]);

    const removeStop = useCallback((uid: string) => {
        setStops(prev => prev.filter(s => s.uid !== uid));
    }, []);

    const clearStops = useCallback(() => {
        setStops([]);
        eventBus.emit('clearLeadTo');
    }, []);

    const handleProwadz = useCallback(() => {
        if (stops.length === 0) return;
        const ids = stops.map(s => s.id);
        eventBus.emit('tripPlanner.leadTo', ids);
    }, [stops]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (inputMode === 'id') {
                addStopById();
            } else {
                addStopByShortcut();
            }
        }
    }, [inputMode, addStopById, addStopByShortcut]);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            setStops(prev => {
                const oldIndex = prev.findIndex(s => s.uid === active.id);
                const newIndex = prev.findIndex(s => s.uid === over.id);
                return arrayMove(prev, oldIndex, newIndex);
            });
        }
    }, []);

    const handleSaveRoute = useCallback(() => {
        if (!routeName.trim() || stops.length === 0) return;
        const newRoute: SavedRoute = {
            name: routeName.trim(),
            stops: stops.map(s => ({ id: s.id, name: s.name })),
        };
        const existingIndex = savedRoutes.findIndex(r => r.name === newRoute.name);
        let updatedRoutes: SavedRoute[];
        if (existingIndex >= 0) {
            updatedRoutes = [...savedRoutes];
            updatedRoutes[existingIndex] = newRoute;
        } else {
            updatedRoutes = [...savedRoutes, newRoute];
        }
        setSavedRoutes(updatedRoutes);
        persistRoutes(updatedRoutes);
        setRouteName('');
    }, [routeName, stops, savedRoutes, persistRoutes]);

    const handleLoadRoute = useCallback(() => {
        if (!selectedRoute) return;
        const route = savedRoutes.find(r => r.name === selectedRoute);
        if (!route) return;
        setStops(route.stops.map(s => ({ ...s, uid: `stop-${++uidCounter}` })));
        setSelectedRoute('');
    }, [selectedRoute, savedRoutes]);

    const handleDeleteRoute = useCallback(() => {
        if (!selectedRoute) return;
        const updatedRoutes = savedRoutes.filter(r => r.name !== selectedRoute);
        setSavedRoutes(updatedRoutes);
        persistRoutes(updatedRoutes);
        setSelectedRoute('');
    }, [selectedRoute, savedRoutes, persistRoutes]);

    const hasUnreachableStops = unreachableStops.size > 0;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="tripPlanner"
            title={`Planer trasy (${stops.length})`}
            minWidth={320}
            minHeight={150}
            initialWidth={380}
            initialHeight={400}
            className="trip-planner-window"
            bodyClassName="trip-planner-window-body"
        >
            <div className="trip-planner-content">
                {/* Saved routes section */}
                {savedRoutes.length > 0 && (
                    <div className="trip-planner-section">
                        <div className="trip-planner-label">Zapisane trasy:</div>
                        <div className="trip-planner-input-row">
                            <select
                                className="trip-planner-select"
                                value={selectedRoute}
                                onChange={e => setSelectedRoute(e.target.value)}
                            >
                                <option value="">-- Wybierz trase --</option>
                                {savedRoutes.map(r => (
                                    <option key={r.name} value={r.name}>
                                        {r.name} ({r.stops.length} przystankow)
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="trip-planner-btn"
                                onClick={handleLoadRoute}
                                disabled={!selectedRoute}
                                title="Wczytaj trase"
                            >
                                Wczytaj
                            </button>
                            <button
                                type="button"
                                className="trip-planner-btn trip-planner-btn--danger"
                                onClick={handleDeleteRoute}
                                disabled={!selectedRoute}
                                title="Usun zapisana trase"
                            >
                                &times;
                            </button>
                        </div>
                    </div>
                )}

                {/* Stops section */}
                <div className="trip-planner-section">
                    <div className="trip-planner-label">Przystanki:</div>
                    {stops.length === 0 ? (
                        <div className="trip-planner-empty">Brak przystankow. Dodaj lokacje ponizej.</div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                            modifiers={dndModifiers}
                        >
                            <SortableContext
                                items={stops.map(s => s.uid)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="trip-planner-stops">
                                    {stops.map((stop, index) => (
                                        <SortableStop
                                            key={stop.uid}
                                            stop={stop}
                                            index={index}
                                            isUnreachable={unreachableStops.has(stop.uid)}
                                            distance={stopDistances.get(stop.uid) ?? null}
                                            color={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                                            onRemove={removeStop}
                                        />
                                    ))}
                                </div>
                                {stops.length > 0 && totalDistance > 0 && (
                                    <div className="trip-planner-total">
                                        Laczna odleglosc: {totalDistance}
                                    </div>
                                )}
                            </SortableContext>
                        </DndContext>
                    )}
                    {hasUnreachableStops && (
                        <div className="trip-planner-warning">
                            Niektore przystanki sa nieosiagalne z poprzedniej lokacji.
                        </div>
                    )}
                </div>

                {/* Add stop section */}
                <div className="trip-planner-section">
                    <div className="trip-planner-label">Dodaj przystanek:</div>
                    <div className="trip-planner-mode-tabs">
                        <button
                            type="button"
                            className={`trip-planner-mode-tab${inputMode === 'id' ? ' trip-planner-mode-tab--active' : ''}`}
                            onClick={() => setInputMode('id')}
                        >
                            Po ID
                        </button>
                        <button
                            type="button"
                            className={`trip-planner-mode-tab${inputMode === 'shortcut' ? ' trip-planner-mode-tab--active' : ''}`}
                            onClick={() => setInputMode('shortcut')}
                        >
                            Ze skrotu
                        </button>
                    </div>

                    {inputMode === 'id' ? (
                        <div className="trip-planner-input-row">
                            <input
                                type="number"
                                className="trip-planner-input"
                                value={idInput}
                                onChange={e => setIdInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="ID lokacji"
                                min="1"
                            />
                            <button
                                type="button"
                                className="trip-planner-btn"
                                onClick={addStopById}
                            >
                                Dodaj
                            </button>
                        </div>
                    ) : (
                        <div className="trip-planner-input-row">
                            <select
                                className="trip-planner-select"
                                value={selectedShortcut}
                                onChange={e => setSelectedShortcut(e.target.value)}
                                onKeyDown={handleKeyDown}
                            >
                                <option value="">-- Wybierz skrot --</option>
                                {shortcuts.map(s => (
                                    <option key={s.key} value={s.key}>
                                        {s.key} ({s.id}) {s.label}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="trip-planner-btn"
                                onClick={addStopByShortcut}
                            >
                                Dodaj
                            </button>
                        </div>
                    )}
                </div>

                {/* Save route section */}
                {stops.length > 0 && (
                    <div className="trip-planner-section">
                        <div className="trip-planner-label">Zapisz trase:</div>
                        <div className="trip-planner-input-row">
                            <input
                                type="text"
                                className="trip-planner-input"
                                value={routeName}
                                onChange={e => setRouteName(e.target.value)}
                                placeholder="Nazwa trasy"
                            />
                            <button
                                type="button"
                                className="trip-planner-btn"
                                onClick={handleSaveRoute}
                                disabled={!routeName.trim()}
                            >
                                Zapisz
                            </button>
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="trip-planner-actions">
                    <button
                        type="button"
                        className="trip-planner-action-btn trip-planner-action-btn--primary"
                        onClick={handleProwadz}
                        disabled={stops.length === 0}
                        title="Pokaz sciezke na mapie"
                    >
                        Prowadz
                    </button>
                    <button
                        type="button"
                        className="trip-planner-action-btn trip-planner-action-btn--danger"
                        onClick={clearStops}
                        disabled={stops.length === 0}
                        title="Wyczysc wszystkie przystanki"
                    >
                        Wyczysc
                    </button>
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

export default TripPlannerPopup;
