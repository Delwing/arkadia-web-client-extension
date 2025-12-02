import React, { useCallback, useEffect, useState, useMemo } from 'react';
import eventBus from '@modules/core/eventBus';
import { useDraggablePopup } from './hooks/useDraggablePopup';
import { getItemSync, setItemSync } from '@modules/core/storage';
import type { Contract } from '@client/scripts/contracts';

interface ContractsPopupPayload {
    contracts: Contract[];
    currentLocationId: number | null;
}

type SortMode = 'distance' | 'time';

const SORT_STORAGE_KEY = 'contractsSortMode';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getDistance(fromId: number | null, toId: number | null): number | null {
    if (fromId === null || toId === null) return null;
    const embedded = (globalThis as any).embedded;
    if (!embedded?.pathFinder) return null;
    const path = embedded.pathFinder.findPath(fromId, toId);
    return path ? path.length - 1 : null;
}

function getDaysRemaining(contract: Contract): number {
    const now = Date.now();
    const diff = contract.deadlineTimestamp - now;
    if (diff <= 0) return 0;
    return Math.ceil(diff / ONE_DAY_MS);
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

function loadSortMode(): SortMode {
    try {
        const stored = getItemSync(SORT_STORAGE_KEY);
        const mode = stored?.[SORT_STORAGE_KEY];
        if (mode === 'distance' || mode === 'time') {
            return mode;
        }
    } catch {
        // ignore
    }
    return 'distance';
}

function saveSortMode(mode: SortMode): void {
    setItemSync(SORT_STORAGE_KEY, mode);
}

const ContractsPopup: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [currentLocationId, setCurrentLocationId] = useState<number | null>(null);
    const [isPinned, setIsPinned] = useState(false);
    const [sortMode, setSortMode] = useState<SortMode>(loadSortMode);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    const togglePinned = useCallback(() => {
        setIsPinned((prev) => !prev);
    }, []);

    const { panelRef, position, size, handlePointerDown, handleResizePointerDown } = useDraggablePopup({
        isOpen,
        isPinned,
        onClose: close,
        minWidth: 350,
        minHeight: 200,
    });

    useEffect(() => {
        const handleOpen = (data: ContractsPopupPayload) => {
            setContracts(data.contracts);
            setCurrentLocationId(data.currentLocationId);
            setIsOpen(true);
        };

        eventBus.on("contracts.popup.open", handleOpen);

        return () => {
            eventBus.off("contracts.popup.open", handleOpen);
        };
    }, []);

    useEffect(() => {
        const handleUpdate = (data: { contracts: Contract[] }) => {
            setContracts(data.contracts);
        };

        eventBus.on("contracts.updated", handleUpdate);

        return () => {
            eventBus.off("contracts.updated", handleUpdate);
        };
    }, []);

    const handleRemove = useCallback((id: string) => {
        eventBus.emit("contracts.remove", { id });
    }, []);

    const handleProwadz = useCallback((locationId: number) => {
        eventBus.emit('sendCommand', { command: `/prowadz ${locationId}` });
    }, []);

    const handleSortChange = useCallback((mode: SortMode) => {
        setSortMode(mode);
        saveSortMode(mode);
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

    if (!isOpen) {
        return null;
    }

    return (
        <div className="contracts-window-container">
            <div
                ref={panelRef}
                className={`contracts-window ${
                    position ? 'contracts-window--floating' : 'contracts-window--center'
                }`}
                style={{
                    ...(position ? { left: `${position.left}px`, top: `${position.top}px` } : {}),
                    ...(size ? { width: `${size.width}px`, height: `${size.height}px` } : {})
                }}
                tabIndex={-1}
            >
                <div className="herb-window-inner">
                    <div className="contracts-window-header" onPointerDown={handlePointerDown}>
                        <h5 className="contracts-window-title">Zlecenia ({contracts.length})</h5>
                        <div
                            className="window-header-actions"
                            onPointerDownCapture={(event) => event.stopPropagation()}
                        >
                            <div className="contracts-sort-buttons">
                                <button
                                    type="button"
                                    className={`contracts-sort-btn${sortMode === 'distance' ? ' contracts-sort-btn--active' : ''}`}
                                    onClick={() => handleSortChange('distance')}
                                    title="Sortuj po odleglosci"
                                >
                                    Odleglosc
                                </button>
                                <button
                                    type="button"
                                    className={`contracts-sort-btn${sortMode === 'time' ? ' contracts-sort-btn--active' : ''}`}
                                    onClick={() => handleSortChange('time')}
                                    title="Sortuj po czasie"
                                >
                                    Czas
                                </button>
                            </div>
                            <button
                                type="button"
                                className={`window-pin-button${isPinned ? ' window-pin-button--active' : ''}`}
                                onClick={togglePinned}
                                title={isPinned ? 'Odepnij okno' : 'Przypnij okno'}
                            />
                            <button type="button" className="btn-close" onClick={close} />
                        </div>
                    </div>
                    <div className="contracts-window-body">
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
                                                    {contract.count} x {contract.item}
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
                    </div>
                    <div
                        className="herb-window-resize-handle"
                        onPointerDown={handleResizePointerDown}
                        title="Drag to resize"
                    />
                </div>
            </div>
        </div>
    );
};

export default ContractsPopup;
