import React, { useCallback, useEffect, useState, useMemo } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import type { Contract } from '@client/scripts/contracts';
import { getEmbeddedMap } from './embedRegistry';

interface ContractsPopupPayload {
    contracts: Contract[];
    currentLocationId: number | null;
}

type SortMode = 'distance' | 'time';

const ONE_INGAME_DAY_MS = 48 * 60 * 1000; // 48 real minutes = 1 in-game day

function getDistance(fromId: number | null, toId: number | null): number | null {
    if (fromId === null || toId === null) return null;
    const embedded = getEmbeddedMap();
    if (!embedded?.pathFinder) return null;
    const path = embedded.pathFinder.findPath(fromId, toId);
    return path ? path.length - 1 : null;
}

function getDaysRemaining(contract: Contract): number {
    const now = Date.now();
    const diff = contract.deadlineTimestamp - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / ONE_INGAME_DAY_MS);
}

function formatDaysRemaining(days: number): string {
    if (days < 0) {
        return "?";
    }
    if (days === 0) {
        return "Dzisiaj!";
    }
    if (days === 1) {
        return "1 dzien";
    }
    if (days >= 2 && days <= 4) {
        return `${days} dni`;
    }
    return `${days} dni`;
}

const POPUP_ID = 'popup:contracts';

const ContractsPopup: React.FC = () => {
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [currentLocationId, setCurrentLocationId] = useState<number | null>(null);
    const [sortMode, setSortMode] = usePopupSetting<SortMode>(POPUP_ID, 'sortMode', 'distance');

    const handleOpen = useCallback((data: ContractsPopupPayload) => {
        setContracts(data.contracts);
        setCurrentLocationId(data.currentLocationId);
    }, []);

    const { wrapperProps } = usePopup<'contracts.popup.open'>(POPUP_ID, {
        openEvent: 'contracts.popup.open',
        onOpen: handleOpen,
    });

    useEffect(() => {
        return eventBus.on("contracts.updated", (data: { contracts: Contract[] }) => {
            setContracts(data.contracts);
        });
    }, []);

    const handleRemove = useCallback((id: string) => {
        eventBus.emit("contracts.remove", { id });
    }, []);

    const handleProwadz = useCallback((locationId: number) => {
        eventBus.emit('sendCommand', { command: `/prowadz ${locationId}` });
    }, []);

    const contractsWithDistance = useMemo(() => {
        return contracts.map(contract => ({
            contract,
            distance: getDistance(currentLocationId, contract.locationId),
        }));
    }, [contracts, currentLocationId]);

    const sortedContracts = useMemo(() => {
        return [...contractsWithDistance].sort((a, b) => {
            if (sortMode === 'distance') {
                const distA = a.distance ?? Number.MAX_SAFE_INTEGER;
                const distB = b.distance ?? Number.MAX_SAFE_INTEGER;
                return distA - distB;
            } else {
                return a.contract.deadlineTimestamp - b.contract.deadlineTimestamp;
            }
        });
    }, [contractsWithDistance, sortMode]);

    const headerActions = (
        <div className="contracts-sort-buttons">
            <button
                type="button"
                className={`contracts-sort-btn${sortMode === 'distance' ? ' contracts-sort-btn--active' : ''}`}
                onClick={() => setSortMode('distance')}
                title="Sortuj po odleglosci"
            >
                Odleglosc
            </button>
            <button
                type="button"
                className={`contracts-sort-btn${sortMode === 'time' ? ' contracts-sort-btn--active' : ''}`}
                onClick={() => setSortMode('time')}
                title="Sortuj po czasie"
            >
                Czas
            </button>
        </div>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="contracts"
            title={`Zlecenia (${contracts.length})`}
            minWidth={350}
            minHeight={200}
            initialWidth={400}
            initialHeight={350}
            className="contracts-window"
            bodyClassName="contracts-window-body"
            headerActions={headerActions}
        >
            {sortedContracts.length === 0 ? (
                <div className="contracts-empty">Brak aktywnych zlecen.</div>
            ) : (
                <div className="contracts-list">
                    {sortedContracts.map(({ contract, distance }) => {
                        const daysRemaining = getDaysRemaining(contract);
                        const isUrgent = daysRemaining <= 2;

                        return (
                            <div
                                key={contract.id}
                                className={`contract-item ${isUrgent ? 'contract-item--urgent' : ''}`}
                            >
                                <div className="contract-header">
                                    <span className="contract-location">{contract.location}</span>
                                    <button
                                        type="button"
                                        className="contract-remove-btn"
                                        onClick={() => handleRemove(contract.id)}
                                        title="Usun zlecenie"
                                    >
                                        X
                                    </button>
                                </div>
                                <div className="contract-details">
                                    <span className="contract-type">{contract.type}</span>
                                    <span className="contract-count">
                                        {contract.count} {contract.unit || 'x'} {contract.item}
                                        {contract.quality && ` (${contract.quality} jakosci)`}
                                    </span>
                                </div>
                                <div className="contract-footer">
                                    {contract.locationId && (
                                        <button
                                            type="button"
                                            className="contract-prowadz-btn"
                                            onClick={() => handleProwadz(contract.locationId!)}
                                            title="Prowadz do lokacji"
                                        >
                                            Prowadz{distance !== null && ` (${distance})`}
                                        </button>
                                    )}
                                    <div className={`contract-deadline ${isUrgent ? 'contract-deadline--urgent' : ''}`}>
                                        {formatDaysRemaining(daysRemaining)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default ContractsPopup;
