import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import type { PackageStatus } from '@shared/events/clientEvents';
import { useClientEvent } from '@web-ui/hooks';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { getEmbeddedMap, subscribeEmbeddedMap } from './embedRegistry';
import {roomContextMenuHandler} from "@modules/core/contextMenus";
import {
    NpcListEntry,
    clearLocal,
    clearRemote,
    refresh as refreshNpc,
    removeLocalNpc,
    subscribe as subscribeNpcStore,
} from './dataStores/npcStore';
import { Button, DeleteButton, HeaderButton, Input, Segmented } from '@web-ui/primitives';
import { Map as MapIcon, MapPin, Navigation, Package, Search, X } from 'lucide-react';

const POPUP_ID = 'popup:packageReceiver';

/** How long "Wyczyść" stays armed waiting for the confirming second click. */
const CONFIRM_MS = 4000;

type SourceFilter = 'all' | 'local';

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
    { value: 'all', label: 'Wszyscy' },
    { value: 'local', label: 'Lokalni' },
];

interface Place {
    room: string;
    area: string;
}

interface ReceiverRow extends NpcListEntry {
    place: Place | null;
    /** Lower-cased name, room and area, matched against the search. */
    haystack: string;
}

/** Room and area names for a room id, or null before the map is in or for an unknown room. */
function placeOf(roomId: number): Place | null {
    const reader = getEmbeddedMap()?.reader;
    const room = reader?.getRoom(roomId) as { name?: string; area?: number } | undefined;
    if (!room) return null;
    const area = room.area !== undefined ? reader?.getArea?.(room.area) : undefined;
    const name = room.name && room.name !== String(roomId) ? room.name : '';
    return { room: name, area: area?.getAreaName?.() ?? '' };
}

/** Opens the map preview on a room - the same as clicking its place, as a button you can find. */
function PreviewButton({ loc, onShowOnMap }: { loc: number; onShowOnMap: (loc: number) => void }) {
    return (
        <Button
            size="sm"
            variant="ghost"
            className="popup-btn--icon package-receiver__preview"
            onClick={() => onShowOnMap(loc)}
            onContextMenu={roomContextMenuHandler(loc)}
            title="Podgląd na mapie"
        >
            <MapIcon size={15} strokeWidth={1.75} />
        </Button>
    );
}

function mmss(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

function PlaceLabel({ place, loc }: { place: Place | null; loc: number }) {
    const room = place?.room || place?.area;
    return (
        <>
            <MapPin size={12} strokeWidth={2} />
            {room ? (
                <span className="package-receiver__place-text">
                    {room}
                    {place?.room && place.area && <span className="package-receiver__area"> · {place.area}</span>}
                </span>
            ) : (
                <span className="package-receiver__place-text">Nieznana lokacja</span>
            )}
            <span className="package-receiver__loc-id">#{loc}</span>
        </>
    );
}

/** The package being carried right now: who it is for, time left and the way there. */
function CurrentPackage({ status, place, onNavigate, onShowOnMap }: {
    status: PackageStatus;
    place: Place | null;
    onNavigate: (loc: number) => void;
    onShowOnMap: (loc: number) => void;
}) {
    const loc = status.location ?? null;
    const urgent = typeof status.seconds === 'number' && status.seconds < 120;
    return (
        <div className="package-receiver__current">
            <Package className="package-receiver__current-icon" size={18} strokeWidth={2} />
            <div className="package-receiver__current-main">
                <div className="package-receiver__current-title">
                    <span className="package-receiver__current-label">Niesiesz paczkę dla</span>
                    <span className="package-receiver__current-name">{status.recipient}</span>
                </div>
                {loc != null ? (
                    <button
                        type="button"
                        className="package-receiver__place"
                        onClick={() => onShowOnMap(loc)}
                        onContextMenu={roomContextMenuHandler(loc)}
                        title="Pokaż na mapie"
                    >
                        <PlaceLabel place={place} loc={loc} />
                    </button>
                ) : (
                    <span className="package-receiver__unknown">Nieznana lokacja odbiorcy</span>
                )}
            </div>
            {typeof status.seconds === 'number' && (
                <span className={`package-receiver__timer${urgent ? ' is-urgent' : ''}`} title="Pozostały czas">
                    {mmss(status.seconds)}
                </span>
            )}
            {loc != null && <PreviewButton loc={loc} onShowOnMap={onShowOnMap} />}
            {loc != null && (
                <Button
                    size="sm"
                    variant="solid"
                    className="package-receiver__go"
                    onClick={() => onNavigate(loc)}
                    onContextMenu={roomContextMenuHandler(loc)}
                    title="Prowadź do odbiorcy"
                >
                    <Navigation size={13} strokeWidth={2} /> Prowadź
                </Button>
            )}
        </div>
    );
}

/**
 * Kept apart from the popup so the package countdown, ticking every second,
 * does not re-render a list that can run to hundreds of rows.
 */
const ReceiverList = memo(function ReceiverList({ rows, recipient, onNavigate, onShowOnMap, onDelete }: {
    rows: ReceiverRow[];
    recipient: string;
    onNavigate: (loc: number) => void;
    onShowOnMap: (loc: number) => void;
    onDelete: (npc: NpcListEntry) => void;
}) {
    return (
        <ul className="package-receiver__list">
            {rows.map(npc => {
                const current = recipient !== '' && npc.name.toLowerCase() === recipient;
                return (
                    <li
                        key={`${npc.name}-${npc.loc}`}
                        className={`package-receiver__npc-item${current ? ' is-current' : ''}`}
                    >
                        <div className="package-receiver__npc-main">
                            <span className="package-receiver__npc-name">
                                <span className="package-receiver__npc-name-text">{npc.name}</span>
                                {current && <span className="package-receiver__badge package-receiver__badge--current">paczka</span>}
                                {npc.source === 'local' && (
                                    <span className="package-receiver__badge" title="Dodano lokalnie">lokalny</span>
                                )}
                            </span>
                            <button
                                type="button"
                                className="package-receiver__place"
                                onClick={() => onShowOnMap(npc.loc)}
                                onContextMenu={roomContextMenuHandler(npc.loc)}
                                title="Pokaż na mapie"
                            >
                                <PlaceLabel place={npc.place} loc={npc.loc} />
                            </button>
                        </div>
                        <div className="package-receiver__npc-actions">
                            <PreviewButton loc={npc.loc} onShowOnMap={onShowOnMap} />
                            <Button
                                size="sm"
                                className="package-receiver__go"
                                onClick={() => onNavigate(npc.loc)}
                                onContextMenu={roomContextMenuHandler(npc.loc)}
                                title="Prowadź do lokacji"
                            >
                                <Navigation size={13} strokeWidth={2} /> Idź
                            </Button>
                            {npc.source === 'local' ? (
                                <DeleteButton onClick={() => onDelete(npc)} />
                            ) : (
                                <span className="package-receiver__action-slot" />
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
});

const PackageReceiverPopup: React.FC = () => {
    const [npcs, setNpcs] = useState<NpcListEntry[]>([]);
    const [search, setSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [status, setStatus] = useState<PackageStatus | null>(null);
    // Ids only resolve to names once the map is in - tick to re-label the rows when it arrives.
    const [mapTick, setMapTick] = useState(0);
    const [confirmClear, setConfirmClear] = useState(false);
    const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleOpen = useCallback(() => {
        setSearch('');
    }, []);

    const { wrapperProps } = usePopup<'packageReceiver.popup.open'>(POPUP_ID, {
        openEvent: 'packageReceiver.popup.open',
        onOpen: handleOpen,
    });

    // The popup stays mounted while closed, so it already knows the package when opened.
    useClientEvent<PackageStatus | null>('packageStatus', setStatus);

    // Subscribe to NPC store
    useEffect(() => {
        const unsubscribe = subscribeNpcStore(snapshot => {
            setNpcs(snapshot?.all.data ?? []);
        });
        void refreshNpc();
        return unsubscribe;
    }, []);

    useEffect(() => subscribeEmbeddedMap(() => setMapTick(tick => tick + 1)), []);
    useEffect(() => () => {
        if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    }, []);

    const handleNavigate = useCallback((loc: number) => {
        eventBus.emit('leadTo', loc);
    }, []);

    const handleShowOnMap = useCallback((roomId: number) => {
        eventBus.emit('staticmap.popup.open', { roomId });
    }, []);

    const handleDeleteNpc = useCallback((npc: NpcListEntry) => {
        if (npc.source !== 'local') return;
        removeLocalNpc({ name: npc.name, loc: npc.loc }).catch(e => console.error('Failed to remove NPC:', e));
    }, []);

    const handleRefreshNpcs = useCallback(async () => {
        try {
            await refreshNpc({ force: true });
        } catch (e) {
            console.error('Failed to update NPC data:', e);
        }
    }, []);

    const handleClearNpcs = useCallback(async () => {
        if (!confirmClear) {
            setConfirmClear(true);
            confirmTimer.current = setTimeout(() => setConfirmClear(false), CONFIRM_MS);
            return;
        }
        if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
        setConfirmClear(false);
        try {
            await clearRemote();
            await clearLocal();
        } catch (e) {
            console.error('Failed to clear NPC data:', e);
        }
    }, [confirmClear]);

    const handleExportNpcs = useCallback(() => {
        const exportable = npcs.map(({ name, loc }) => ({ name, loc }));
        const json = JSON.stringify(exportable, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'arkadia-npcs.json';
        a.click();
        URL.revokeObjectURL(url);
    }, [npcs]);

    const rows = useMemo<ReceiverRow[]>(() => npcs
        .map(npc => {
            const place = placeOf(npc.loc);
            const haystack = [npc.name, place?.room, place?.area, String(npc.loc)].join('\n').toLowerCase();
            return { ...npc, place, haystack };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    // mapTick re-runs placeOf once the map has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [npcs, mapTick]);

    const localCount = useMemo(() => npcs.filter(n => n.source === 'local').length, [npcs]);

    // With no local entries left the filter is hidden, so it must not hide everything either.
    const onlyLocal = sourceFilter === 'local' && localCount > 0;

    const visibleRows = useMemo(() => {
        const query = search.trim().toLowerCase();
        return rows.filter(row =>
            (!onlyLocal || row.source === 'local')
            && (!query || row.haystack.includes(query)));
    }, [rows, search, onlyLocal]);

    const recipient = status?.recipient.toLowerCase() ?? '';
    const currentPlace = useMemo(
        () => (status?.location != null ? placeOf(status.location) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [status?.location, mapTick],
    );

    const filtered = visibleRows.length !== npcs.length;
    const title = filtered
        ? `Odbiorcy paczek (${visibleRows.length}/${npcs.length})`
        : `Odbiorcy paczek (${npcs.length})`;

    const headerActions = (
        <>
            <HeaderButton onClick={handleRefreshNpcs} title="Aktualizuj listę NPC">Aktualizuj</HeaderButton>
            <HeaderButton onClick={handleExportNpcs} title="Eksportuj listę NPC">Eksport</HeaderButton>
            <HeaderButton danger={confirmClear} onClick={handleClearNpcs} title="Wyczyść listę NPC">
                {confirmClear ? 'Na pewno?' : 'Wyczyść'}
            </HeaderButton>
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="packageReceiver"
            title={title}
            minWidth={340}
            minHeight={200}
            initialWidth={528}
            initialHeight={440}
            className="package-receiver"
            bodyClassName="package-receiver-body"
            headerActions={headerActions}
        >
            {status && (
                <CurrentPackage
                    status={status}
                    place={currentPlace}
                    onNavigate={handleNavigate}
                    onShowOnMap={handleShowOnMap}
                />
            )}
            <div className="package-receiver__controls">
                <div className="package-receiver__search">
                    <Search className="package-receiver__search-icon" size={14} strokeWidth={2} />
                    <Input
                        placeholder="Szukaj odbiorcy lub miejsca..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            type="button"
                            className="package-receiver__search-clear"
                            onClick={() => setSearch('')}
                            title="Wyczyść wyszukiwanie"
                        >
                            <X size={14} strokeWidth={2} />
                        </button>
                    )}
                </div>
                {localCount > 0 && (
                    <Segmented size="sm" value={sourceFilter} options={SOURCE_OPTIONS} onChange={setSourceFilter} />
                )}
            </div>
            <div className="package-receiver__content">
                {visibleRows.length === 0 ? (
                    <div className="package-receiver__empty">
                        {npcs.length === 0 ? 'Brak odbiorców.' : 'Brak wyników.'}
                    </div>
                ) : (
                    <ReceiverList
                        rows={visibleRows}
                        recipient={recipient}
                        onNavigate={handleNavigate}
                        onShowOnMap={handleShowOnMap}
                        onDelete={handleDeleteNpc}
                    />
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default PackageReceiverPopup;
