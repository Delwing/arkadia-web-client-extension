import React, { useEffect, useMemo, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { MONTHS, MONTHS_ORDER } from '@client/scripts/clock';

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
    'var(--popup-data-spring-green)', // wiosna (spring)
    'var(--popup-data-yellow)',       // lato (summer)
    'var(--popup-data-orange)',       // jesien (autumn)
    'var(--popup-data-blue)',         // zima (winter)
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

function getDayOfYear(domain: "Empire" | "Ishtar", month: string, dayOfMonth: number): number {
    const months = MONTHS_ORDER[domain];
    let dayOfYear = 0;
    for (const m of months) {
        if (m === month) {
            return dayOfYear + dayOfMonth;
        }
        dayOfYear += MONTHS[m].length;
    }
    return dayOfYear + dayOfMonth;
}

type DateMode = "month" | "dayOfYear";

const POPUP_ID = 'popup:clock';

const ClockPopup: React.FC = () => {
    const { wrapperProps, setIsOpen } = usePopup(POPUP_ID);
    const [empireData, setEmpireData] = useState<ClockData | null>(null);
    const [ishtarData, setIshtarData] = useState<ClockData | null>(null);
    const [activeTab, setActiveTab] = useState<"Empire" | "Ishtar">("Empire");
    const [showEdit, setShowEdit] = useState(false);
    const [setHourValue, setSetHourValue] = useState<string>("");
    const [setMinuteValue, setSetMinuteValue] = useState<string>("");
    const [selectedMonth, setSelectedMonth] = useState<string>("");
    const [setDayOfMonthValue, setSetDayOfMonthValue] = useState<string>("");
    const [setDayOfYearValue, setSetDayOfYearValue] = useState<string>("");
    const [dateMode, setDateMode] = useState<DateMode>("month");

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

    // Reset date selections when switching tabs
    useEffect(() => {
        setSelectedMonth("");
        setSetDayOfMonthValue("");
        setSetDayOfYearValue("");
    }, [activeTab]);

    const months = useMemo(() => MONTHS_ORDER[activeTab], [activeTab]);
    const selectedMonthLength = selectedMonth ? MONTHS[selectedMonth]?.length ?? 1 : 1;
    const maxDay = activeTab === "Empire" ? 400 : 360;

    const handleSetTime = () => {
        const hour = parseInt(setHourValue, 10);
        if (isNaN(hour) || hour < 0 || hour > 23) {
            return;
        }
        const payload: { domain: "Empire" | "Ishtar"; hour: number; minutes?: number; dayOfYear?: number } = { domain: activeTab, hour };

        if (setMinuteValue) {
            const minutes = parseInt(setMinuteValue, 10);
            if (!isNaN(minutes) && minutes >= 0 && minutes <= 59) {
                payload.minutes = minutes;
            }
        }

        if (dateMode === "month" && selectedMonth && setDayOfMonthValue) {
            const dayOfMonth = parseInt(setDayOfMonthValue, 10);
            if (!isNaN(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= selectedMonthLength) {
                payload.dayOfYear = getDayOfYear(activeTab, selectedMonth, dayOfMonth);
            }
        } else if (dateMode === "dayOfYear" && setDayOfYearValue) {
            const dayOfYear = parseInt(setDayOfYearValue, 10);
            if (!isNaN(dayOfYear) && dayOfYear >= 1 && dayOfYear <= maxDay) {
                payload.dayOfYear = dayOfYear;
            }
        }

        eventBus.emit("clock.setTime", payload);
        setSetHourValue("");
        setSetMinuteValue("");
        setSelectedMonth("");
        setSetDayOfMonthValue("");
        setSetDayOfYearValue("");
    };

    const isHourValid = setHourValue !== "" && !isNaN(parseInt(setHourValue, 10)) && parseInt(setHourValue, 10) >= 0 && parseInt(setHourValue, 10) <= 23;
    const isMinuteValid = setMinuteValue === "" || (!isNaN(parseInt(setMinuteValue, 10)) && parseInt(setMinuteValue, 10) >= 0 && parseInt(setMinuteValue, 10) <= 59);
    const isDayValid = dateMode === "month"
        ? (!selectedMonth || !setDayOfMonthValue || (!isNaN(parseInt(setDayOfMonthValue, 10)) && parseInt(setDayOfMonthValue, 10) >= 1 && parseInt(setDayOfMonthValue, 10) <= selectedMonthLength))
        : (!setDayOfYearValue || (!isNaN(parseInt(setDayOfYearValue, 10)) && parseInt(setDayOfYearValue, 10) >= 1 && parseInt(setDayOfYearValue, 10) <= maxDay));

    const currentData = activeTab === "Empire" ? empireData : ishtarData;

    const headerActions = (
        <button
            type="button"
            className={`popup-btn clock-header-toggle${showEdit ? ' popup-btn--primary' : ''}`}
            onClick={() => setShowEdit(!showEdit)}
            title={showEdit ? 'Ukryj edycje' : 'Ustaw czas'}
        >
            Ustaw
        </button>
    );

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
            headerActions={headerActions}
        >
            <div className="popup-tabs clock-tabs">
                <button
                    type="button"
                    className={`popup-tab ${
                        activeTab === 'Empire' ? 'popup-tab--active' : ''
                    }`}
                    onClick={() => setActiveTab('Empire')}
                >
                    Imperium
                </button>
                <button
                    type="button"
                    className={`popup-tab ${
                        activeTab === 'Ishtar' ? 'popup-tab--active' : ''
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
                    {showEdit && (
                        <>
                            <div className="clock-detail-separator"></div>
                            <div className="clock-set-time-section">
                                <div className="clock-set-time-row">
                                    <span className="clock-detail-label">Godzina:</span>
                                    <div className="clock-set-time-controls">
                                        <input
                                            type="number"
                                            className="popup-input clock-set-time-input"
                                            min={0}
                                            max={23}
                                            value={setHourValue}
                                            onChange={(e) => setSetHourValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSetTime(); }}
                                            placeholder="0-23"
                                        />
                                        <span className="clock-set-time-colon">:</span>
                                        <input
                                            type="number"
                                            className="popup-input clock-set-time-input"
                                            min={0}
                                            max={59}
                                            value={setMinuteValue}
                                            onChange={(e) => setSetMinuteValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSetTime(); }}
                                            placeholder="00"
                                        />
                                    </div>
                                </div>
                                <div className="clock-set-time-row">
                                    <span className="clock-detail-label">Data:</span>
                                    <div className="clock-set-time-controls">
                                        <button
                                            type="button"
                                            className={`clock-set-time-toggle ${dateMode === 'month' ? 'clock-set-time-toggle--active' : ''}`}
                                            onClick={() => setDateMode('month')}
                                        >
                                            Miesiac
                                        </button>
                                        <button
                                            type="button"
                                            className={`clock-set-time-toggle ${dateMode === 'dayOfYear' ? 'clock-set-time-toggle--active' : ''}`}
                                            onClick={() => setDateMode('dayOfYear')}
                                        >
                                            Dzien roku
                                        </button>
                                    </div>
                                </div>
                                {dateMode === "month" ? (
                                    <>
                                        <div className="clock-set-time-row">
                                            <span className="clock-detail-label">Miesiac:</span>
                                            <select
                                                className="popup-input clock-set-time-select"
                                                value={selectedMonth}
                                                onChange={(e) => {
                                                    setSelectedMonth(e.target.value);
                                                    setSetDayOfMonthValue("");
                                                }}
                                            >
                                                <option value="">--</option>
                                                {months.map((m) => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                        </div>
                                        {selectedMonth && (
                                            <div className="clock-set-time-row">
                                                <span className="clock-detail-label">Dzien:</span>
                                                <input
                                                    type="number"
                                                    className="popup-input clock-set-time-input"
                                                    min={1}
                                                    max={selectedMonthLength}
                                                    value={setDayOfMonthValue}
                                                    onChange={(e) => setSetDayOfMonthValue(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSetTime(); }}
                                                    placeholder={`1-${selectedMonthLength}`}
                                                />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="clock-set-time-row">
                                        <span className="clock-detail-label">Dzien roku:</span>
                                        <input
                                            type="number"
                                            className="popup-input clock-set-time-input"
                                            min={1}
                                            max={maxDay}
                                            value={setDayOfYearValue}
                                            onChange={(e) => setSetDayOfYearValue(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') handleSetTime(); }}
                                            placeholder={`1-${maxDay}`}
                                        />
                                    </div>
                                )}
                                <div className="clock-set-time-row clock-set-time-row--action">
                                    <button
                                        type="button"
                                        className="popup-btn popup-btn--md popup-btn--primary"
                                        onClick={handleSetTime}
                                        disabled={!isHourValid || !isMinuteValid || !isDayValid}
                                    >
                                        Ustaw
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

export default ClockPopup;
