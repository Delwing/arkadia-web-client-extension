import { useCallback, useEffect, useMemo, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { characterStorage } from '@modules/core/storage';
import {
    getKnowledgeEventsForCharacter,
    type KnowledgeEvent,
} from '@modules/data/dataStores/knowledgeEventsStore';
import { getRoomDistances } from '@modules/core/roomInfoProvider';
import { getEmbeddedMap } from '@web/embedRegistry';
import { WIEDZA_IMPORTED_EVENT } from '@web/imports/WiedzaImport.tsx';
import {
    buildCategoryRows,
    levelsFromHistory,
    type BooksPayload,
    type CategoryRow,
    type DetailsPayload,
    type LibrariesPayload,
} from './knowledgeModel';

/**
 * Everything the Wiedza window shows, kept current: the three reports the
 * knowledge script sends, and the level history recorded per character.
 * While the window is open, reports it has not seen yet are asked for.
 */
export function useKnowledgeData(isOpen: boolean) {
    const [details, setDetails] = useState<DetailsPayload | null>(null);
    const [libraries, setLibraries] = useState<LibrariesPayload | null>(null);
    const [books, setBooks] = useState<BooksPayload | null>(null);
    const [history, setHistory] = useState<KnowledgeEvent[] | null>(null);
    // Bumped whenever the history may have grown (a tick, a new report, an import).
    const [historyVersion, setHistoryVersion] = useState(0);
    // Bumped on every step, so distances and "here" follow the player.
    const [roomVersion, setRoomVersion] = useState(0);

    useEffect(() => {
        const bumpHistory = () => setHistoryVersion((v) => v + 1);
        const unsubs = [
            eventBus.on('knowledgeDetailsReport', (payload) => {
                const report = payload as DetailsPayload | null;
                setDetails(report?.categories?.length ? report : null);
                bumpHistory();
            }),
            eventBus.on('knowledgeReport', (payload) => {
                const report = payload as LibrariesPayload | null;
                setLibraries(report?.libraries ? report : null);
            }),
            eventBus.on('knowledgeReportCurrentLibrary', (id) => {
                setLibraries((prev) => (prev ? { ...prev, currentLibraryId: id as string | null } : prev));
            }),
            eventBus.on('knowledgeBookReport', (payload) => setBooks(payload as BooksPayload | null)),
            eventBus.on('knowledgeTickEvent', bumpHistory),
            eventBus.on('knowledgeEvents.changed', bumpHistory),
            eventBus.on('enterLocation', () => setRoomVersion((v) => v + 1)),
        ];
        window.addEventListener(WIEDZA_IMPORTED_EVENT, bumpHistory);
        return () => {
            unsubs.forEach((off) => off());
            window.removeEventListener(WIEDZA_IMPORTED_EVENT, bumpHistory);
        };
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        if (!details) eventBus.emit('requestKnowledgeDetailsReport');
        if (!libraries) eventBus.emit('requestKnowledgeReport');
        if (!books) eventBus.emit('requestKnowledgeBookReport');
        // Only on opening: an empty answer must not be asked for again and again.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const character = characterStorage.getCharacter()?.trim() || '';
        if (!character) {
            setHistory([]);
            return;
        }
        let cancelled = false;
        void getKnowledgeEventsForCharacter(character).then((events) => {
            if (!cancelled) setHistory(events);
        });
        return () => {
            cancelled = true;
        };
    }, [isOpen, historyVersion]);

    const levels = useMemo(() => levelsFromHistory(history ?? []), [history]);
    const rows = useMemo(() => buildCategoryRows(details, libraries, books, levels), [details, libraries, books, levels]);

    /** When the game last answered `wiedza o ...` (the newest category). */
    const updatedAt = useMemo(() => {
        const times = (details?.categories ?? []).map((c) => c.updatedAt ?? 0);
        return times.length ? Math.max(...times) || null : null;
    }, [details]);

    return { details, libraries, books, history, rows, updatedAt, roomVersion };
}

/** Every room the window may ask a distance for: entries and libraries. */
export function knowledgeRoomIds(rows: CategoryRow[], libraries: LibrariesPayload | null): number[] {
    const ids = new Set<number>();
    for (const row of rows) {
        for (const entry of row.entries) if (typeof entry.id === 'number') ids.add(entry.id);
    }
    for (const lib of libraries?.libraries ?? []) if (typeof lib.roomId === 'number') ids.add(lib.roomId);
    return [...ids];
}

/**
 * Steps from where the player stands, or null when there is no way (or no map).
 * The first ask after a step measures every room in `roomIds` in one search:
 * a pathfind per entry froze the window with hundreds of entries on screen.
 */
export function useDistance(roomVersion: number, roomIds: readonly number[]) {
    const table = useMemo(() => ({ steps: null as Map<number, number | null> | null }),
        // A new table per step: every distance changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [roomVersion, roomIds]);
    return useCallback((roomId: number | null | undefined): number | null => {
        if (roomId == null) return null;
        table.steps ??= getRoomDistances(roomIds);
        if (!table.steps.has(roomId)) table.steps.set(roomId, getRoomDistances([roomId]).get(roomId) ?? null);
        return table.steps.get(roomId) ?? null;
    }, [table, roomIds]);
}

/** The map area a room is in ("Oxenfurt"), if the map knows the room. */
export function areaOfRoom(roomId: number | null | undefined): string | undefined {
    if (roomId == null) return undefined;
    const reader = getEmbeddedMap()?.reader;
    const room = reader?.getRoom(roomId) as { area?: number } | undefined;
    if (room?.area === undefined) return undefined;
    return reader?.getArea?.(room.area)?.getAreaName?.() ?? undefined;
}

export function currentArea(): string | undefined {
    const room = getEmbeddedMap()?.currentRoom;
    return typeof room === 'number' ? areaOfRoom(room) : undefined;
}

/**
 * Prowadź to a library. The map room is looked up when the report is built;
 * if the map was not ready then, the map resolves the library's id now.
 */
export function leadToLibrary(lib: { roomId?: number | null; locationId: string }) {
    if (lib.roomId != null) eventBus.emit('leadTo', lib.roomId);
    else eventBus.emit('leadToByInternalId', lib.locationId);
}
