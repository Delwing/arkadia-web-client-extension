import React, { useCallback, useEffect, useState, useMemo } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import {
    NpcListEntry,
    clearLocal,
    clearRemote,
    refresh as refreshNpc,
    removeLocalNpc,
    subscribe as subscribeNpcStore,
} from './dataStores/npcStore';

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
        <div className="package-receiver__sort-buttons">
            <button
                type="button"
                className="popup-btn"
                onClick={handleRefreshNpcs}
                title="Aktualizuj liste NPC"
            >
                Aktualizuj
            </button>
            <button
                type="button"
                className="popup-btn"
                onClick={handleExportNpcs}
                title="Eksportuj liste NPC"
            >
                Eksport
            </button>
            <button
                type="button"
                className="popup-btn"
                onClick={handleClearNpcs}
                title="Wyczysc liste NPC"
            >
                Wyczysc
            </button>
        </div>
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
                    <input
                        type="text"
                        placeholder="Filtruj..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="form-control form-control-sm"
                    />
                    {search && (
                        <button
                            type="button"
                            className="package-receiver__search-clear"
                            onClick={() => setSearch('')}
                        >
                            X
                        </button>
                    )}
                </div>
            </div>
            <div className="package-receiver__content">
                {sortedNpcs.length === 0 ? (
                    <div className="package-receiver__empty">
                        {npcs.length === 0 ? 'Brak odbiorcow.' : 'Brak wynikow.'}
                    </div>
                ) : (
                    <div className="package-receiver__list">
                        {sortedNpcs.map(npc => (
                            <div
                                key={`${npc.name}-${npc.loc}`}
                                className="package-receiver__npc-item"
                            >
                                <span className="package-receiver__npc-name">{npc.name}</span>
                                <span className="package-receiver__npc-loc">{npc.loc}</span>
                                <div className="package-receiver__npc-actions">
                                    <button
                                        type="button"
                                        className="package-receiver__npc-btn"
                                        onClick={() => handleShowOnMap(npc.loc)}
                                        title="Pokaz na mapie"
                                    >
                                        &#x1f50d;
                                    </button>
                                    <button
                                        type="button"
                                        className="package-receiver__npc-btn"
                                        onClick={() => handleNavigate(npc.loc)}
                                        title="Prowadz do lokacji"
                                    >
                                        Idz
                                    </button>
                                    {npc.source === 'local' && (
                                        <button
                                            type="button"
                                            className="package-receiver__npc-btn package-receiver__npc-btn--delete"
                                            onClick={() => handleDeleteNpc(npc)}
                                            title="Usun"
                                        >
                                            X
                                        </button>
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
