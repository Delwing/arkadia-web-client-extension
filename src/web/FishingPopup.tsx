import React, { useCallback, useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import type { FishingState, FishingStatePayload, BaitType } from '@client/scripts/fishing';
import { BAIT_OPTIONS } from '@client/scripts/fishing';

const POPUP_ID = 'popup:fishing';

function formatElapsedTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const FishingPopup: React.FC = () => {
    const [fishingState, setFishingState] = useState<FishingState>('idle');
    const [castTimestamp, setCastTimestamp] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const [selectedBait, setSelectedBait] = usePopupSetting<BaitType>(POPUP_ID, 'bait', 'kulke');

    const handleOpen = useCallback((data: FishingStatePayload) => {
        setFishingState(data.state);
        setCastTimestamp(data.castTimestamp);
    }, []);

    const { wrapperProps } = usePopup<'fishing.popup.open'>(POPUP_ID, {
        openEvent: 'fishing.popup.open',
        onOpen: handleOpen,
    });

    // Listen for state updates
    useEffect(() => {
        return eventBus.on("fishing.state", (data: FishingStatePayload) => {
            setFishingState(data.state);
            setCastTimestamp(data.castTimestamp);
        });
    }, []);

    // Timer for elapsed time
    useEffect(() => {
        if (castTimestamp === null) {
            setElapsedTime(0);
            return;
        }

        const updateElapsed = () => {
            setElapsedTime(Date.now() - castTimestamp);
        };

        updateElapsed();
        const interval = setInterval(updateElapsed, 1000);

        return () => clearInterval(interval);
    }, [castTimestamp]);

    const handleCast = useCallback(() => {
        eventBus.emit("fishing.cast", { bait: selectedBait });
    }, [selectedBait]);

    const handlePull = useCallback(() => {
        eventBus.emit("fishing.pull");
    }, []);

    const handleStrike = useCallback(() => {
        eventBus.emit("fishing.strike");
    }, []);

    const getStatusText = () => {
        switch (fishingState) {
            case 'idle':
                return 'Nie lowisz';
            case 'fishing':
                return 'Lowisz...';
            case 'biting':
                return 'Bierze!';
            case 'pulling':
                return 'Wyciagasz...';
            default:
                return '';
        }
    };

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="fishing"
            title="Wedka"
            minWidth={200}
            minHeight={220}
            initialWidth={220}
            initialHeight={280}
            className="fishing-window"
            bodyClassName="fishing-window-body"
        >
            <div className="fishing-content">
                <div className={`fishing-status fishing-status--${fishingState}`}>
                    {getStatusText()}
                </div>

                {fishingState !== 'idle' && (
                    <div className="fishing-timer">
                        {formatElapsedTime(elapsedTime)}
                    </div>
                )}

                {fishingState === 'idle' && (
                    <div className="fishing-bait-selector">
                        {BAIT_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                className={`fishing-bait-btn ${selectedBait === option.value ? 'fishing-bait-btn--selected' : ''}`}
                                onClick={() => setSelectedBait(option.value)}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                )}

                <div className="fishing-buttons">
                    {fishingState === 'idle' && (
                        <button
                            type="button"
                            className="popup-btn popup-btn--lg fishing-btn--cast"
                            onClick={handleCast}
                        >
                            Zarzuc wedke
                        </button>
                    )}
                    {(fishingState === 'fishing' || fishingState === 'biting') && (
                        <>
                            <button
                                type="button"
                                className="popup-btn popup-btn--lg fishing-btn--pull"
                                onClick={handlePull}
                            >
                                Wyciagnij wedke
                            </button>
                            <button
                                type="button"
                                className={`popup-btn popup-btn--lg fishing-btn--strike ${fishingState === 'biting' ? 'fishing-btn--biting' : ''}`}
                                onClick={handleStrike}
                            >
                                Zatnij rybe
                            </button>
                        </>
                    )}
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

export default FishingPopup;
