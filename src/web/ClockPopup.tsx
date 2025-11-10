import React, { useCallback, useEffect, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';

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

type PointerDragState = {
    pointerId: number;
    offsetX: number;
    offsetY: number;
};

function clamp(value: number, min: number, max: number): number {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}

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
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<PointerDragState | null>(null);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    const togglePinned = useCallback(() => {
        setIsPinned((prev) => !prev);
    }, []);

    const ensureVisiblePosition = useCallback((prev: { left: number; top: number } | null) => {
        if (!prev || !panelRef.current) {
            return prev;
        }
        const margin = 16;
        const width = panelRef.current.offsetWidth;
        const height = panelRef.current.offsetHeight;
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const maxTop = Math.max(margin, window.innerHeight - height - margin);
        const nextLeft = clamp(prev.left, margin, maxLeft);
        const nextTop = clamp(prev.top, margin, maxTop);
        if (nextLeft === prev.left && nextTop === prev.top) {
            return prev;
        }
        return { left: nextLeft, top: nextTop };
    }, []);

    const handlePointerMove = useCallback((event: PointerEvent) => {
        const drag = dragState.current;
        if (!drag || event.pointerId !== drag.pointerId || !panelRef.current) {
            return;
        }
        const margin = 16;
        const width = panelRef.current.offsetWidth;
        const height = panelRef.current.offsetHeight;
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const maxTop = Math.max(margin, window.innerHeight - height - margin);
        const nextLeft = clamp(event.clientX - drag.offsetX, margin, maxLeft);
        const nextTop = clamp(event.clientY - drag.offsetY, margin, maxTop);
        setPosition({ left: nextLeft, top: nextTop });
    }, []);

    const endPointerDrag = useCallback(
        (event: PointerEvent) => {
            const drag = dragState.current;
            if (!drag || event.pointerId !== drag.pointerId) {
                return;
            }
            dragState.current = null;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', endPointerDrag);
            window.removeEventListener('pointercancel', endPointerDrag);
        },
        [handlePointerMove],
    );

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) {
                return;
            }
            if (!panelRef.current) {
                return;
            }
            const rect = panelRef.current.getBoundingClientRect();
            dragState.current = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
            };
            setPosition((prev) => prev ?? { left: rect.left, top: rect.top });
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', endPointerDrag);
            window.addEventListener('pointercancel', endPointerDrag);
            event.preventDefault();
        },
        [endPointerDrag, handlePointerMove],
    );

    useEffect(() => {
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', endPointerDrag);
            window.removeEventListener('pointercancel', endPointerDrag);
        };
    }, [endPointerDrag, handlePointerMove]);

    useEffect(() => {
        if (isOpen) {
            return;
        }
        dragState.current = null;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', endPointerDrag);
        window.removeEventListener('pointercancel', endPointerDrag);
    }, [endPointerDrag, handlePointerMove, isOpen]);

    useEffect(() => {
        const handleResize = () => {
            setPosition((prev) => ensureVisiblePosition(prev));
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [ensureVisiblePosition]);

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

    useEffect(() => {
        const handleBackdropClick = (event: MouseEvent) => {
            if (isPinned) {
                return;
            }
            const target = event.target as HTMLElement;
            if (target.classList.contains('clock-window-container')) {
                close();
            }
        };

        if (isOpen) {
            document.addEventListener('click', handleBackdropClick);
            return () => {
                document.removeEventListener('click', handleBackdropClick);
            };
        }
    }, [close, isOpen, isPinned]);

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
