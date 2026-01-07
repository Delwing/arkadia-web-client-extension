import React, { useEffect, useState, useCallback } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import type { WalkerState } from '@shared/events/clientEvents';

const POPUP_ID = 'popup:walker';

const defaultState: WalkerState = {
    active: false,
    paused: false,
    path: [],
    currentIndex: 0,
    target: null,
    delay: 1,
};

const WalkerPopup: React.FC = () => {
    const { wrapperProps, setIsOpen} = usePopup(POPUP_ID);
    const [state, setState] = useState<WalkerState>(defaultState);
    const [delayInput, setDelayInput] = useState('1.00');

    // Listen for state updates
    useEffect(() => {
        const handleUpdate = (newState: WalkerState) => {
            setState(newState);
        };

        eventBus.on('walker.update', handleUpdate);

        return () => {
            eventBus.off('walker.update', handleUpdate);
        };
    }, []);

    // Listen for open event
    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
        };

        eventBus.on('walker.popup.open', handleOpen);

        return () => {
            eventBus.off('walker.popup.open', handleOpen);
        };
    }, [setIsOpen]);

    // Sync delay input with state
    useEffect(() => {
        setDelayInput(state.delay.toFixed(2));
    }, [state.delay]);

    const handleStop = useCallback(() => {
        eventBus.emit('walker.stop');
    }, []);

    const handleResume = useCallback(() => {
        eventBus.emit('walker.resume');
    }, []);

    const handleFaster = useCallback(() => {
        eventBus.emit('walker.faster');
    }, []);

    const handleSlower = useCallback(() => {
        eventBus.emit('walker.slower');
    }, []);

    const handleDelayChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setDelayInput(e.target.value);
    }, []);

    const handleDelayBlur = useCallback(() => {
        const value = parseFloat(delayInput);
        if (!isNaN(value) && value >= 0.5) {
            eventBus.emit('walker.setDelay', value);
        }
    }, [delayInput]);

    const handleDelayKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleDelayBlur();
        }
    }, [handleDelayBlur]);

    const locationsLeft = state.path.length > 0 ? state.path.length - 1 - state.currentIndex : 0;

    const statusText = state.active
        ? state.paused
            ? 'Wstrzymany'
            : 'Aktywny'
        : 'Nieaktywny';

    const statusClass = state.active
        ? state.paused
            ? 'walker-popup__status--paused'
            : 'walker-popup__status--active'
        : 'walker-popup__status--inactive';

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="walker"
            title="Walker"
            minWidth={280}
            minHeight={180}
            initialWidth={320}
            initialHeight={300}
            className="walker-popup"
            bodyClassName="walker-popup-body"
        >
            <div className="walker-popup__content">
                {/* Status Section */}
                <div className="walker-popup__section">
                    <div className="walker-popup__status-row">
                        <span className="walker-popup__label">Status:</span>
                        <span className={`walker-popup__status ${statusClass}`}>
                            {statusText}
                        </span>
                    </div>
                    {state.target !== null && (
                        <div className="walker-popup__status-row">
                            <span className="walker-popup__label">Cel:</span>
                            <span className="walker-popup__value walker-popup__value--target">
                                {state.target}
                            </span>
                        </div>
                    )}
                    {state.active && (
                        <>
                            <div className="walker-popup__status-row">
                                <span className="walker-popup__label">Postep:</span>
                                <span className="walker-popup__value">
                                    {state.currentIndex} / {state.path.length - 1}
                                </span>
                            </div>
                            <div className="walker-popup__status-row">
                                <span className="walker-popup__label">Pozostalo:</span>
                                <span className="walker-popup__value">
                                    {locationsLeft} krokow
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {/* Delay Controls */}
                <div className="walker-popup__section">
                    <div className="walker-popup__delay-row">
                        <span className="walker-popup__label">Opoznienie:</span>
                        <div className="walker-popup__delay-controls">
                            <button
                                type="button"
                                className="walker-popup__btn walker-popup__btn--small"
                                onClick={handleFaster}
                                title="Szybciej (-0.5s)"
                            >
                                -
                            </button>
                            <input
                                type="number"
                                className="walker-popup__delay-input"
                                value={delayInput}
                                onChange={handleDelayChange}
                                onBlur={handleDelayBlur}
                                onKeyDown={handleDelayKeyDown}
                                min="0.5"
                                step="0.1"
                            />
                            <span className="walker-popup__delay-unit">s</span>
                            <button
                                type="button"
                                className="walker-popup__btn walker-popup__btn--small"
                                onClick={handleSlower}
                                title="Wolniej (+0.5s)"
                            >
                                +
                            </button>
                        </div>
                    </div>
                </div>

                {/* Control Buttons */}
                {state.active && (
                    <div className="walker-popup__controls">
                        {state.paused ? (
                            <button
                                type="button"
                                className="walker-popup__btn walker-popup__btn--success"
                                onClick={handleResume}
                            >
                                Wznow
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="walker-popup__btn walker-popup__btn--danger"
                                onClick={handleStop}
                            >
                                Stop
                            </button>
                        )}
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default WalkerPopup;
