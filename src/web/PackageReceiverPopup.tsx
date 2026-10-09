import React, { useCallback, useEffect, useState, useMemo } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import {roomContextMenuHandler} from "@modules/core/contextMenus";
import {
    NpcListEntry,
    clearLocal,
    clearRemote,
    refresh as refreshNpc,
    removeLocalNpc,
    subscribe as subscribeNpcStore,
} from './dataStores/npcStore';
import { Button, DeleteButton, HeaderButton, Input } from '@web-ui/primitives';
import { MapPin, Navigation, Search, X } from 'lucide-react';

const POPUP_ID = 'popup:packageReceiver';

const PackageReceiverPopup: React.FC = () => {
    const [npcs, setNpcs] = useState<NpcListEntry[]>([]);
    const [search, setSearch] = useState('');

    const handleOpen = useCallback(() => {
        setSearch('');
    }, []);

    const { wrapperProps } = usePopup<'packageReceiver.popup.open'>(POPUP_ID, {
        openEvent: 'packageReceiver.popup.open',
        onOpen: handleOpen,
    });

    // Subscribe to NPC store
    useEffect(() => {
        const unsubscribe = subscribeNpcStore(snapshot => {
            setNpcs(snapshot?.all.data ?? []);
        });
        void refreshNpc();
        return unsubscribe;
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
        try {
            await clearRemote();
            await clearLocal();
        } catch (e) {
            console.error('Failed to clear NPC data:', e);
        }
    }, []);

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

    const sortedNpcs = useMemo(() => {
        let list = npcs;
        if (search) {
            const lower = search.toLowerCase();
            list = list.filter(n => n.name.toLowerCase().includes(lower));
        }
        return [...list].sort((a, b) => a.name.localeCompare(b.name));
    }, [npcs, search]);

    const headerActions = (
        <>
            <HeaderButton onClick={handleRefreshNpcs} title="Aktualizuj listę NPC">Aktualizuj</HeaderButton>
            <HeaderButton onClick={handleExportNpcs} title="Eksportuj listę NPC">Eksport</HeaderButton>
            <HeaderButton danger onClick={handleClearNpcs} title="Wyczyść listę NPC">Wyczyść</HeaderButton>
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="packageReceiver"
            title={`Odbiorcy paczek (${npcs.length})`}
            minWidth={340}
            minHeight={200}
            initialWidth={528}
            initialHeight={400}
            className="package-receiver"
            bodyClassName="package-receiver-body"
            headerActions={headerActions}
        >
            <div className="package-receiver__controls">
                <div className="package-receiver__search">
                    <Search className="package-receiver__search-icon" size={14} strokeWidth={2} />
                    <Input
                        placeholder="Szukaj odbiorcy..."
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
            </div>
            <div className="package-receiver__content">
                {sortedNpcs.length === 0 ? (
                    <div className="package-receiver__empty">
                        {npcs.length === 0 ? 'Brak odbiorców.' : 'Brak wyników.'}
                    </div>
                ) : (
                    <div className="package-receiver__list">
                        <div className="package-receiver__head">
                            <span>Odbiorca</span>
                            <span>Lokacja</span>
                            <span />
                        </div>
                        {sortedNpcs.map(npc => (
                            <div
                                key={`${npc.name}-${npc.loc}`}
                                className="package-receiver__npc-item"
                            >
                                <span className="package-receiver__npc-name">
                                    <span className="package-receiver__npc-name-text">{npc.name}</span>
                                    {npc.source === 'local' && (
                                        <span className="package-receiver__badge" title="Dodano lokalnie">lokalny</span>
                                    )}
                                </span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="package-receiver__npc-loc"
                                    onClick={() => handleShowOnMap(npc.loc)}
                                    onContextMenu={roomContextMenuHandler(npc.loc)}
                                    title="Pokaż na mapie"
                                >
                                    <MapPin size={13} strokeWidth={2} />
                                    {npc.loc}
                                </Button>
                                <div className="package-receiver__npc-actions">
                                    <Button
                                        size="sm"
                                        className="package-receiver__go"
                                        onClick={() => handleNavigate(npc.loc)}
                                        onContextMenu={roomContextMenuHandler(npc.loc)}
                                        title="Prowadź do lokacji"
                                    >
                                        <Navigation size={13} strokeWidth={2} /> Idź
                                    </Button>
                                    {npc.source === 'local' ? (
                                        <DeleteButton onClick={() => handleDeleteNpc(npc)} />
                                    ) : (
                                        <span className="package-receiver__action-slot" />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default PackageReceiverPopup;
