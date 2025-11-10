import React, { useCallback, useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { useDraggablePopup } from './hooks/useDraggablePopup';

type ClockData = {
    domain: "Empire" | "Ishtar";
    hours: number;
    minutes: number;
    precision: number;
    sunrise: number | string | "?";
    sunset: number | string | "?";
    dayLabel: string;
    dayOfMonth: number;
    dayOfYear: number;
    daylight?: boolean;
    season?: number;
};

// Season names and colors matching ClockDisplay
const SEASON_NAMES = ['Wiosna', 'Lato', 'Jesien', 'Zima'];
const SEASON_COLORS = [
    '#00ff7f', // wiosna (spring)
    '#ffff00', // lato (summer)
    '#ff8c00', // jesien (autumn)
    '#00bfff'  // zima (winter)
];

function formatTime(hours: number, minutes: number): string {
    const h = hours.toString().padStart(2, '0');
    const m = Math.floor(minutes).toString().padStart(2, '0');
    return `${h}:${m}`;
}

function formatSunTime(value: number | string | "?"): string {
    if (value === "?" || value === "") {
        return "?";
    }
    const num = typeof value === "number" ? value : parseInt(value, 10);
    if (isNaN(num)) {
        return "?";
    }
    return `${num.toString().padStart(2, '0')}:00`;
}

const ClockPopup: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [empireData, setEmpireData] = useState<ClockData | null>(null);
    const [ishtarData, setIshtarData] = useState<ClockData | null>(null);
    const [activeTab, setActiveTab] = useState<"Empire" | "Ishtar">("Empire");
    const [isPinned, setIsPinned] = useState(false);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    const togglePinned = useCallback(() => {
        setIsPinned((prev) => !prev);
    }, []);

    const { panelRef, position, handlePointerDown } = useDraggablePopup({
        isOpen,
        isPinned,
        onClose: close,
    });

    useEffect(() => {
        const handleClockUpdate = (data: ClockData) => {
            if (data.domain === "Empire") {
                setEmpireData(data);
            } else if (data.domain === "Ishtar") {
                setIshtarData(data);
            }
        };

        eventBus.on("clock.update", handleClockUpdate);

        return () => {
            eventBus.off("clock.update", handleClockUpdate);
        };
    }, []);

    useEffect(() => {
        const handleOpen = (data?: { domain?: "Empire" | "Ishtar" }) => {
            setIsOpen(true);
            if (data?.domain) {
                setActiveTab(data.domain);
            } else if (empireData) {
                setActiveTab("Empire");
            } else if (ishtarData) {
                setActiveTab("Ishtar");
            }
        };

        eventBus.on("clock.popup.open", handleOpen);

        return () => {
            eventBus.off("clock.popup.open", handleOpen);
        };
    }, [empireData, ishtarData]);

    if (!isOpen) {
        return null;
    }

    const currentData = activeTab === "Empire" ? empireData : ishtarData;

    return (
        <div className="clock-window-container">
            <div
                ref={panelRef}
                className={`clock-window ${
                    position ? 'clock-window--floating' : 'clock-window--center'
                }`}
                style={position ? { left: `${position.left}px`, top: `${position.top}px` } : undefined}
                tabIndex={-1}
            >
                <div className="clock-window-header" onPointerDown={handlePointerDown}>
                    <h5 className="clock-window-title">Zegar</h5>
                    <div
                        className="window-header-actions"
                        onPointerDownCapture={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className={`window-pin-button${isPinned ? ' window-pin-button--active' : ''}`}
                            onClick={togglePinned}
                            title={isPinned ? 'Odepnij okno' : 'Przypnij okno'}
                        />
                        <button type="button" className="btn-close" onClick={close} />
                    </div>
                </div>
                <div className="clock-window-body">
                    <div className="clock-tabs">
                        <button
                            type="button"
                            className={`clock-tab-button ${
                                activeTab === 'Empire' ? 'clock-tab-button--active' : ''
                            }`}
                            onClick={() => setActiveTab('Empire')}
                            disabled={!empireData}
                        >
                            Imperium
                        </button>
                        <button
                            type="button"
                            className={`clock-tab-button ${
                                activeTab === 'Ishtar' ? 'clock-tab-button--active' : ''
                            }`}
                            onClick={() => setActiveTab('Ishtar')}
                            disabled={!ishtarData}
                        >
                            Ishtar
                        </button>
                    </div>
                    <div className="clock-content">
                        {!currentData ? (
                            <div className="clock-empty">Brak danych zegara dla tej domeny.</div>
                        ) : (
                            <div className="clock-details">
                                <div className="clock-detail-row">
                                    <span className="clock-detail-label">Aktualny czas:</span>
                                    <span className={`clock-detail-value clock-time ${currentData.daylight ? 'clock-daylight' : 'clock-night'}`}>
                                        {formatTime(currentData.hours, currentData.minutes)}
                                        {currentData.precision > 0 && (
                                            <span className="clock-precision"> ±{currentData.precision}min</span>
                                        )}
                                    </span>
                                </div>
                                <div className="clock-detail-row">
                                    <span className="clock-detail-label">Data:</span>
                                    <span className="clock-detail-value">{currentData.dayLabel}</span>
                                </div>
                                <div className="clock-detail-row">
                                    <span className="clock-detail-label">Dzien roku:</span>
                                    <span className="clock-detail-value">{currentData.dayOfYear}</span>
                                </div>
                                <div className="clock-detail-row">
                                    <span className="clock-detail-label">Dzien miesiaca:</span>
                                    <span className="clock-detail-value">{currentData.dayOfMonth}</span>
                                </div>
                                {currentData.season !== undefined && (
                                    <div className="clock-detail-row">
                                        <span className="clock-detail-label">Pora roku:</span>
                                        <span
                                            className="clock-detail-value"
                                            style={{ color: SEASON_COLORS[currentData.season] }}
                                        >
                                            {SEASON_NAMES[currentData.season]}
                                        </span>
                                    </div>
                                )}
                                <div className="clock-detail-separator"></div>
                                <div className="clock-detail-row">
                                    <span className="clock-detail-label">Wschod slonca:</span>
                                    <span className="clock-detail-value">{formatSunTime(currentData.sunrise)}</span>
                                </div>
                                <div className="clock-detail-row">
                                    <span className="clock-detail-label">Zachod slonca:</span>
                                    <span className="clock-detail-value">{formatSunTime(currentData.sunset)}</span>
                                </div>
                                {currentData.daylight !== undefined && (
                                    <div className="clock-detail-row">
                                        <span className="clock-detail-label">Pora dnia:</span>
                                        <span className={`clock-detail-value ${currentData.daylight ? 'clock-daylight' : 'clock-night'}`}>
                                            {currentData.daylight ? 'Dzien' : 'Noc'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClockPopup;
