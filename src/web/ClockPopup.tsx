import React, { useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';

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

const POPUP_ID = 'popup:clock';

const ClockPopup: React.FC = () => {
    const { wrapperProps, setIsOpen } = usePopup(POPUP_ID);
    const [empireData, setEmpireData] = useState<ClockData | null>(null);
    const [ishtarData, setIshtarData] = useState<ClockData | null>(null);
    const [activeTab, setActiveTab] = useState<"Empire" | "Ishtar">("Empire");

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
    }, [empireData, ishtarData, setIsOpen]);

    // Listen for active domain changes to auto-switch tabs
    useEffect(() => {
        const handleDomainChange = (data: { domain: "Empire" | "Ishtar" }) => {
            setActiveTab(data.domain);
        };

        eventBus.on("clock.domain.active", handleDomainChange);

        return () => {
            eventBus.off("clock.domain.active", handleDomainChange);
        };
    }, []);

    const currentData = activeTab === "Empire" ? empireData : ishtarData;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="clock"
            title="Zegar"
            minWidth={300}
            minHeight={200}
            initialWidth={480}
            className="clock-window"
            bodyClassName="clock-window-body"
        >
            <div className="clock-tabs">
                <button
                    type="button"
                    className={`clock-tab-button ${
                        activeTab === 'Empire' ? 'clock-tab-button--active' : ''
                    }`}
                    onClick={() => setActiveTab('Empire')}
                >
                    Imperium
                </button>
                <button
                    type="button"
                    className={`clock-tab-button ${
                        activeTab === 'Ishtar' ? 'clock-tab-button--active' : ''
                    }`}
                    onClick={() => setActiveTab('Ishtar')}
                >
                    Ishtar
                </button>
            </div>
            <div className="clock-content">
                <div className="clock-details">
                    <div className="clock-detail-row">
                        <span className="clock-detail-label">Aktualny czas:</span>
                        <span className={`clock-detail-value clock-time ${currentData?.daylight ? 'clock-daylight' : 'clock-night'}`}>
                            {currentData ? formatTime(currentData.hours, currentData.minutes) : '--:--'}
                            {currentData && currentData.precision > 0 && (
                                <span className="clock-precision"> ±{currentData.precision}min</span>
                            )}
                        </span>
                    </div>
                    <div className="clock-detail-row">
                        <span className="clock-detail-label">Data:</span>
                        <span className="clock-detail-value">{currentData?.dayLabel ?? '--'}</span>
                    </div>
                    <div className="clock-detail-row">
                        <span className="clock-detail-label">Dzien roku:</span>
                        <span className="clock-detail-value">{currentData?.dayOfYear ?? '--'}</span>
                    </div>
                    <div className="clock-detail-row">
                        <span className="clock-detail-label">Pora roku:</span>
                        <span
                            className="clock-detail-value"
                            style={currentData?.season !== undefined ? { color: SEASON_COLORS[currentData.season] } : undefined}
                        >
                            {currentData?.season !== undefined ? SEASON_NAMES[currentData.season] : '--'}
                        </span>
                    </div>
                    <div className="clock-detail-separator"></div>
                    <div className="clock-detail-row">
                        <span className="clock-detail-label">Wschod slonca:</span>
                        <span className="clock-detail-value">{currentData ? formatSunTime(currentData.sunrise) : '--:--'}</span>
                    </div>
                    <div className="clock-detail-row">
                        <span className="clock-detail-label">Zachod slonca:</span>
                        <span className="clock-detail-value">{currentData ? formatSunTime(currentData.sunset) : '--:--'}</span>
                    </div>
                    <div className="clock-detail-row">
                        <span className="clock-detail-label">Pora dnia:</span>
                        <span className={`clock-detail-value ${currentData?.daylight ? 'clock-daylight' : 'clock-night'}`}>
                            {currentData?.daylight !== undefined ? (currentData.daylight ? 'Dzien' : 'Noc') : '--'}
                        </span>
                    </div>
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

export default ClockPopup;
