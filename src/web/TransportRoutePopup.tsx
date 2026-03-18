import React, { useCallback, useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import type { TransportRoutePayload, TransportTimerPayload } from '@client/types/transport';

const POPUP_ID = 'popup:transport-route';

function formatTime(seconds: number | null): string {
    if (seconds === null) {
        return '?';
    }
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const TransportRoutePopup: React.FC = () => {
    const { wrapperProps } = usePopup(POPUP_ID, {
        openEvent: 'transport.popup.open',
    });

    const [route, setRoute] = useState<TransportRoutePayload | null>(null);
    const [timer, setTimer] = useState<TransportTimerPayload | null>(null);
    const [alertStopIndex, setAlertStopIndex] = useState<number | null>(null);
    const [arrivedAlertIndex, setArrivedAlertIndex] = useState<number | null>(null);

    useEffect(() => {
        return eventBus.on('transportRoute', (data) => {
            setRoute(data);
            if (!data) {
                setAlertStopIndex(null);
                setArrivedAlertIndex(null);
            }
        });
    }, []);

    useEffect(() => {
        return eventBus.on('transportTimer', (data) => {
            setTimer(data);
        });
    }, []);

    useEffect(() => {
        return eventBus.on('transportArrival', (stopIndex) => {
            if (alertStopIndex === stopIndex) {
                setArrivedAlertIndex(stopIndex);
                setAlertStopIndex(null);
            }
        });
    }, [alertStopIndex]);

    // Clear arrived flash when route changes (transport departs again)
    useEffect(() => {
        if (arrivedAlertIndex !== null && route?.activeStopIndex !== undefined) {
            setArrivedAlertIndex(null);
        }
    }, [route?.activeStopIndex, arrivedAlertIndex]);

    const handleStopClick = useCallback((index: number) => {
        setArrivedAlertIndex(null);
        setAlertStopIndex(prev => prev === index ? null : index);
    }, []);

    const title = route ? `Trasa: ${route.transportName}` : 'Trasa';

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="transport-route"
            title={title}
            minWidth={250}
            minHeight={200}
            initialWidth={300}
            className="transport-route-popup"
            bodyClassName="transport-route-popup-body"
        >
            {!route ? (
                <div className="transport-route-popup__empty">
                    Brak aktywnej trasy
                </div>
            ) : (
                <div className="transport-route-popup__stops">
                    {/* Origin label */}
                    <div className="transport-route-popup__stop">
                        {route.originLabel}
                    </div>

                    {route.stops.map((stop, index) => {
                        const isActiveStop = route.activeStopIndex === index;
                        const isActiveSegment = isActiveStop && route.onBoard;
                        const isAlertStop = alertStopIndex === index;
                        const isArrivedAlert = arrivedAlertIndex === index;
                        const segmentTime = isActiveSegment && timer !== null
                            ? timer.remaining
                            : stop.durationSeconds;

                        const stopClasses = [
                            'transport-route-popup__stop',
                            isActiveStop ? 'transport-route-popup__stop--active' : '',
                            isAlertStop ? 'transport-route-popup__stop--alert' : '',
                            isArrivedAlert ? 'transport-route-popup__stop--arrived' : '',
                        ].filter(Boolean).join(' ');

                        return (
                            <React.Fragment key={index}>
                                <div className={`transport-route-popup__segment${isActiveSegment ? ' transport-route-popup__segment--active' : ''}`}>
                                    <span className="transport-route-popup__segment-arrow">&#8595;</span>
                                    <span className="transport-route-popup__segment-time">{formatTime(segmentTime)}</span>
                                </div>
                                <div
                                    className={stopClasses}
                                    onClick={() => handleStopClick(index)}
                                >
                                    {isActiveStop && (
                                        <span className="transport-route-popup__stop-marker">&#9658;</span>
                                    )}
                                    {stop.label}
                                    {isAlertStop && (
                                        <span className="transport-route-popup__alert-icon">&#128276;</span>
                                    )}
                                </div>
                            </React.Fragment>
                        );
                    })}

                    {/* Loop indicator */}
                    <div className="transport-route-popup__loop">
                        &#8635;
                    </div>
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default TransportRoutePopup;
