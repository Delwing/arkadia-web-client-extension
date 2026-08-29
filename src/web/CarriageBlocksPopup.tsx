import React, { useCallback, useEffect, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { clearBlockedRooms, getBlockedRooms, unblockRoom } from '@modules/data/carriageBlocks';
import { getEmbeddedMap, subscribeEmbeddedMap } from './embedRegistry';

const POPUP_ID = 'popup:carriageBlocks';

/** How long "clear all" stays armed waiting for the confirming second click. */
const CONFIRM_MS = 4000;

/** "Wozownia, Scala (894)" — the same shape the carriages popup and /wozbloki print. */
function roomLabel(roomId: number): string {
    const reader = getEmbeddedMap()?.reader;
    const room = reader?.getRoom(roomId) as { name?: string; area?: number } | undefined;
    const name = room?.name && room.name !== String(roomId) ? room.name : '';
    const area = room?.area !== undefined ? reader?.getArea?.(room.area) : undefined;
    const areaName = area?.getAreaName?.() ?? '';
    if (name && areaName) return `${name}, ${areaName} (${roomId})`;
    if (name) return `${name} (${roomId})`;
    return String(roomId);
}

const CarriageBlocksPopup: React.FC = () => {
    const [rooms, setRooms] = useState<number[]>(() => [...getBlockedRooms()]);
    // Ids only resolve to names once the map is in - tick to re-render the labels when it arrives.
    const [, setMapTick] = useState(0);
    const [confirmClear, setConfirmClear] = useState(false);
    const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { wrapperProps } = usePopup<'carriageBlocks.popup.open'>(POPUP_ID, {
        openEvent: 'carriageBlocks.popup.open',
    });

    useEffect(() => eventBus.on('carriageBlocks.changed', () => setRooms([...getBlockedRooms()])), []);
    useEffect(() => subscribeEmbeddedMap(() => setMapTick(tick => tick + 1)), []);
    useEffect(() => () => {
        if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    }, []);

    const handlePreview = useCallback((roomId: number) => {
        eventBus.emit('staticmap.popup.open', { roomId });
    }, []);

    const handleRemove = useCallback((roomId: number) => {
        unblockRoom(roomId);
    }, []);

    const handleClearAll = useCallback(() => {
        if (!confirmClear) {
            setConfirmClear(true);
            confirmTimer.current = setTimeout(() => setConfirmClear(false), CONFIRM_MS);
            return;
        }
        if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
        setConfirmClear(false);
        clearBlockedRooms();
    }, [confirmClear]);

    const headerActions = rooms.length > 0 ? (
        <button
            type="button"
            className={`popup-btn popup-btn--sm${confirmClear ? ' popup-btn--danger' : ''}`}
            onClick={handleClearAll}
            title="Usun wszystkie blokady"
        >
            {confirmClear ? 'Na pewno?' : 'Wyczysc'}
        </button>
    ) : undefined;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="carriageBlocks"
            title={`Blokady wozu (${rooms.length})`}
            minWidth={300}
            minHeight={160}
            initialWidth={400}
            initialHeight={340}
            className="carriage-blocks-window"
            bodyClassName="carriage-blocks-window-body"
            headerActions={headerActions}
        >
            {rooms.length === 0 ? (
                <div className="popup-empty">
                    Brak zablokowanych lokacji. Uzyj /wozblok stojac w takiej lokacji.
                </div>
            ) : (
                <div className="popup-list carriage-blocks-list">
                    {rooms.map(roomId => (
                        <div key={roomId} className="carriage-block-item">
                            <span className="carriage-block-label" title={roomLabel(roomId)}>
                                {roomLabel(roomId)}
                            </span>
                            <button
                                type="button"
                                className="popup-btn popup-btn--sm"
                                onClick={() => handlePreview(roomId)}
                                title={`Pokaz lokacje ${roomId} na mapie`}
                            >
                                Mapa
                            </button>
                            <button
                                type="button"
                                className="carriage-remove-btn"
                                onClick={() => handleRemove(roomId)}
                                title="Usun blokade"
                            >
                                X
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default CarriageBlocksPopup;
