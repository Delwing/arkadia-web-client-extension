import React, { useCallback, useEffect, useMemo, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import type { CarriageEntry } from '@client/scripts/carriage';
import { getEmbeddedMap, subscribeEmbeddedMap } from './embedRegistry';

interface CarriagesPopupPayload {
    carriages: CarriageEntry[];
    currentLocationId: number | null;
}

const POPUP_ID = 'popup:carriages';

/** The countdown only needs minute resolution, so a slow tick is plenty. */
const TICK_MS = 30_000;

/** Below this the deposit is close enough to lapsing to shout about it. */
const URGENT_MS = 30 * 60 * 1000;

function getDistance(fromId: number | null, toId: number | null): number | null {
    if (fromId === null || toId === null) return null;
    const embedded = getEmbeddedMap();
    if (!embedded?.pathFinder) return null;
    const path = embedded.pathFinder.findPath(fromId, toId);
    return path ? path.length - 1 : null;
}

const pad = (value: number) => String(value).padStart(2, '0');

function formatMoment(ms: number): string {
    const date = new Date(ms);
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** How much of the deposit window is left, as a percentage of its full length. */
function remainingPercent(carriage: CarriageEntry, now: number): number {
    const total = carriage.depositExpiresAt - carriage.leasedAt;
    if (total <= 0) return 0;
    const left = carriage.depositExpiresAt - now;
    return Math.min(100, Math.max(0, (left / total) * 100));
}

function formatLeft(ms: number): string {
    if (ms <= 0) return 'termin minal';
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `za ${hours}h ${minutes % 60}min` : `za ${minutes}min`;
}

const CarriagesPopup: React.FC = () => {
    const [carriages, setCarriages] = useState<CarriageEntry[]>([]);
    const [currentLocationId, setCurrentLocationId] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());

    const handleOpen = useCallback((data: CarriagesPopupPayload) => {
        setCarriages(data.carriages);
        setCurrentLocationId(data.currentLocationId);
        setNow(Date.now());
    }, []);

    const { wrapperProps } = usePopup<'carriages.popup.open'>(POPUP_ID, {
        openEvent: 'carriages.popup.open',
        onOpen: handleOpen,
    });

    useEffect(() => {
        return eventBus.on('carriages.updated', (data: { carriages: CarriageEntry[] }) => {
            setCarriages(data.carriages);
        });
    }, []);

    // The open payload only seeds the position; without this the distances would stay frozen at
    // wherever the popup happened to be opened from.
    useEffect(() => {
        return eventBus.on('enterLocation', (data: { id: number }) => {
            if (typeof data?.id === 'number') setCurrentLocationId(data.id);
        });
    }, []);

    // A docked or pinned popup is already open at load, with no open event to fill it. Ask for the
    // list on mount, and again when the map arrives so the room labels resolve to real names.
    useEffect(() => subscribeEmbeddedMap(map => {
        if (typeof map?.currentRoom === 'number') setCurrentLocationId(map.currentRoom);
        eventBus.emit('carriages.request');
    }), []);

    useEffect(() => {
        if (!wrapperProps.isOpen) return;
        const timer = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(timer);
    }, [wrapperProps.isOpen]);

    const handleRemove = useCallback((key: string) => {
        eventBus.emit('carriages.remove', { key });
    }, []);

    const handleProwadz = useCallback((locationId: number) => {
        eventBus.emit('sendCommand', { command: `/prowadz ${locationId}` });
    }, []);

    const rows = useMemo(() => carriages.map(carriage => ({
        carriage,
        leasedInDistance: getDistance(currentLocationId, carriage.leasedIn),
        parkedInDistance: getDistance(currentLocationId, carriage.parkedIn),
    })), [carriages, currentLocationId]);

    const renderRoom = (
        label: string,
        roomId: number | null,
        roomLabel: string | null,
        distance: number | null,
        fallback: string,
    ) => (
        <div className="carriage-room">
            <span className="carriage-room-label">{label}</span>
            {roomId === null ? (
                <span className="carriage-room-unknown">{fallback}</span>
            ) : (
                <>
                    <button
                        type="button"
                        className="popup-btn popup-btn--primary popup-btn--sm"
                        onClick={() => handleProwadz(roomId)}
                        title={`Prowadz do lokacji ${roomId}`}
                    >
                        {roomLabel ?? roomId}
                    </button>
                    {distance !== null && (
                        <span className="carriage-room-distance">
                            {distance} {distance === 1 ? 'pokoj' : 'pokoi'}
                        </span>
                    )}
                </>
            )}
        </div>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="carriages"
            title={`Wozy (${carriages.length})`}
            minWidth={320}
            minHeight={180}
            initialWidth={420}
            initialHeight={320}
            className="carriages-window"
            bodyClassName="carriages-window-body"
        >
            {rows.length === 0 ? (
                <div className="popup-empty">Brak wynajetych pojazdow.</div>
            ) : (
                <div className="popup-list carriages-list">
                    {rows.map(({ carriage, leasedInDistance, parkedInDistance }) => {
                        const left = carriage.depositExpiresAt > 0 ? carriage.depositExpiresAt - now : null;
                        const isUrgent = left !== null && left <= URGENT_MS;

                        return (
                            <div
                                key={carriage.key}
                                className={`carriage-item${isUrgent ? ' carriage-item--urgent' : ''}`}
                            >
                                <div className="carriage-header">
                                    <span className="carriage-name">{carriage.name}</span>
                                    {carriage.driven && (
                                        <span className={`carriage-badge${carriage.moving ? ' carriage-badge--moving' : ''}`}>
                                            {carriage.moving ? 'jedziesz' : 'stoisz'}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className="carriage-remove-btn"
                                        onClick={() => handleRemove(carriage.key)}
                                        title="Zapomnij o tym pojezdzie"
                                    >
                                        X
                                    </button>
                                </div>

                                {carriage.leasedAt > 0 && (
                                    <div className="carriage-details">
                                        <span className="carriage-detail-label">
                                            {carriage.gender === 'f' ? 'Wynajeta' : 'Wynajety'}
                                        </span>
                                        <span className="carriage-detail-value">{formatMoment(carriage.leasedAt)}</span>
                                    </div>
                                )}
                                {carriage.rent && (
                                    <div className="carriage-details">
                                        <span className="carriage-detail-label">Koszt najmu</span>
                                        <span className="carriage-detail-value">{carriage.rent}</span>
                                    </div>
                                )}
                                {carriage.deposit && (
                                    <div className="carriage-details">
                                        <span className="carriage-detail-label">Kaucja</span>
                                        <span className="carriage-detail-value">{carriage.deposit}</span>
                                    </div>
                                )}

                                {renderRoom('Wozownia', carriage.leasedIn, carriage.leasedInLabel, leasedInDistance, 'nieznana')}
                                {carriage.driven
                                    ? renderRoom('Parkuje', null, null, null, 'w uzyciu')
                                    : renderRoom('Parkuje', carriage.parkedIn, carriage.parkedInLabel, parkedInDistance, 'nieznane')}

                                {left !== null && (
                                    <>
                                        <div className={`carriage-deadline${isUrgent ? ' carriage-deadline--urgent' : ''}`}>
                                            Kaucja w calosci do {formatMoment(carriage.depositExpiresAt)} ({formatLeft(left)})
                                        </div>
                                        <div className="carriage-deposit-bar">
                                            <div
                                                className={`carriage-deposit-bar-fill${isUrgent ? ' carriage-deposit-bar-fill--urgent' : ''}`}
                                                style={{ width: `${remainingPercent(carriage, now)}%` }}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default CarriagesPopup;
