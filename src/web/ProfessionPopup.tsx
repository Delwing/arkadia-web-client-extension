import React, { useCallback, useEffect, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import eventBus from '@modules/core/eventBus';
import { characterStorage } from '@modules/core/storage';
import {
    getState,
    setState,
    getTimePoints,
    getNumberOfWeeks,
    getNextBreakPoint,
    getPlusPoints,
    FULL_PROFESSION_POINTS,
    WEEKLY_POINTS,
    PLUS_POINT,
    STORAGE_KEY,
    type ProfessionState,
} from '@client/scripts/profession';

const POPUP_ID = 'popup:profession';

function formatDate(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateInput(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimeUntil(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}min`;
}

const ProfessionPopup: React.FC = () => {
    const { wrapperProps } = usePopup(POPUP_ID, {
        openEvent: 'profession.popup.open',
    });
    const [state, setLocalState] = useState<ProfessionState | null>(null);
    const [editingStart, setEditingStart] = useState(false);
    const [startInput, setStartInput] = useState('');
    const [editingPlus, setEditingPlus] = useState(false);
    const [plusInput, setPlusInput] = useState('');

    const loadState = useCallback(() => {
        setLocalState(getState());
    }, []);

    useEffect(() => {
        if (wrapperProps.isOpen) loadState();
    }, [wrapperProps.isOpen, loadState]);

    useEffect(() => {
        return eventBus.on('profession.updated', loadState);
    }, [loadState]);

    // Reload on storage changes (e.g. character switch)
    useEffect(() => {
        return characterStorage.onChange('profession', () => {
            if (wrapperProps.isOpen) loadState();
        });
    }, [wrapperProps.isOpen, loadState]);

    const now = Math.floor(Date.now() / 1000);

    const timePoints = state ? getTimePoints(state, now) : 0;
    const plusPoints = state ? getPlusPoints(state) : 0;
    const totalPoints = timePoints + plusPoints;
    const percentage = state ? Math.min((totalPoints / FULL_PROFESSION_POINTS) * 100, 100) : 0;
    const isDone = percentage >= 100;
    const weeks = state ? getNumberOfWeeks(state, now) : 0;
    const nextBreakpoint = state ? getNextBreakPoint(now) : 0;
    const secondsToNext = nextBreakpoint - now;
    const plusEventCount = state?.plus_events.length ?? 0;

    const handleSaveStart = () => {
        if (!state) return;
        const d = new Date(startInput);
        if (isNaN(d.getTime())) return;
        const newState: ProfessionState = {
            ...state,
            start_time: Math.floor(d.getTime() / 1000),
            edited_at: Math.floor(Date.now() / 1000),
        };
        setState(newState);
        setLocalState(newState);
        setEditingStart(false);
        eventBus.emit('profession.updated');
    };

    const handleSavePlus = () => {
        if (!state) return;
        const val = parseInt(plusInput, 10);
        if (isNaN(val) || val < 0) return;
        // Rebuild plus_events array with the desired count
        const currentCount = state.plus_events.length;
        let newEvents: number[];
        if (val <= currentCount) {
            newEvents = state.plus_events.slice(0, val);
        } else {
            // Add synthetic events
            newEvents = [...state.plus_events];
            const baseTime = newEvents.length > 0 ? newEvents[newEvents.length - 1] : state.start_time;
            for (let i = 0; i < val - currentCount; i++) {
                newEvents.push(baseTime + i + 1);
            }
        }
        const newState: ProfessionState = {
            ...state,
            plus_events: newEvents,
            edited_at: Math.floor(Date.now() / 1000),
        };
        setState(newState);
        setLocalState(newState);
        setEditingPlus(false);
        eventBus.emit('profession.updated');
    };

    const handleInit = () => {
        const startTime = Math.floor(Date.now() / 1000);
        const newState: ProfessionState = {
            start_time: startTime,
            plus_events: [],
            edited_at: startTime,
        };
        setState(newState);
        setLocalState(newState);
        eventBus.emit('profession.updated');
    };

    const handleReset = () => {
        characterStorage.remove(STORAGE_KEY);
        setLocalState(null);
        eventBus.emit('profession.updated');
    };

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="profession"
            title="Zawod"
            minWidth={280}
            minHeight={150}
            initialWidth={340}
            className="profession-window"
        >
            <div className="profession-body">
                {!state ? (
                    <div className="profession-init">
                        <div className="profession-init__note">Brak danych o zawodzie</div>
                        <button type="button" className="popup-btn popup-btn--success" onClick={handleInit}>
                            Rozpocznij trening
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Progress bar */}
                        <div>
                            <div className="profession-progress__head">
                                <span className="profession-progress__label">Postep</span>
                                <span className={`profession-progress__percent${isDone ? ' profession-progress__percent--done' : ''}`}>
                                    {percentage.toFixed(1)}%
                                </span>
                            </div>
                            <div className="profession-progress__track">
                                <div
                                    className={`profession-progress__fill${isDone ? ' profession-progress__fill--done' : ''}`}
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                />
                            </div>
                            <div className="profession-progress__points">
                                {totalPoints} / {FULL_PROFESSION_POINTS} pkt
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="profession-stats">
                            {/* Start time */}
                            <div className="profession-stat">
                                <span className="profession-stat__label">Rozpoczecie:</span>
                                {editingStart ? (
                                    <span className="profession-stat__edit">
                                        <input
                                            type="datetime-local"
                                            className="popup-input profession-stat__input profession-stat__input--date"
                                            value={startInput}
                                            onChange={e => setStartInput(e.target.value)}
                                        />
                                        <button type="button" className="popup-btn popup-btn--success" onClick={handleSaveStart}>OK</button>
                                        <button type="button" className="popup-btn" onClick={() => setEditingStart(false)}>X</button>
                                    </span>
                                ) : (
                                    <span
                                        className="profession-stat__editable"
                                        onClick={() => { setStartInput(formatDateInput(state.start_time)); setEditingStart(true); }}
                                        title="Kliknij aby edytowac"
                                    >
                                        {formatDate(state.start_time)}
                                    </span>
                                )}
                            </div>

                            {/* Weeks */}
                            <div className="profession-stat">
                                <span className="profession-stat__label">Tygodnie:</span>
                                <span className="profession-stat__value">{weeks} ({timePoints} pkt, {WEEKLY_POINTS}/tydz)</span>
                            </div>

                            {/* Next breakpoint */}
                            {secondsToNext > 0 && (
                                <div className="profession-stat">
                                    <span className="profession-stat__label">Nastepne +{WEEKLY_POINTS}:</span>
                                    <span className="profession-stat__countdown">{formatTimeUntil(secondsToNext)}</span>
                                </div>
                            )}

                            {/* Plus events */}
                            <div className="profession-stat">
                                <span className="profession-stat__label">Bonusy (+staz):</span>
                                {editingPlus ? (
                                    <span className="profession-stat__edit">
                                        <input
                                            type="number"
                                            min={0}
                                            className="popup-input profession-stat__input profession-stat__input--count"
                                            value={plusInput}
                                            onChange={e => setPlusInput(e.target.value)}
                                        />
                                        <button type="button" className="popup-btn popup-btn--success" onClick={handleSavePlus}>OK</button>
                                        <button type="button" className="popup-btn" onClick={() => setEditingPlus(false)}>X</button>
                                    </span>
                                ) : (
                                    <span
                                        className="profession-stat__editable"
                                        onClick={() => { setPlusInput(String(plusEventCount)); setEditingPlus(true); }}
                                        title="Kliknij aby edytowac"
                                    >
                                        {plusEventCount}x ({plusPoints} pkt, {PLUS_POINT}/bonus)
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="profession-actions">
                            <button type="button" className="popup-btn popup-btn--danger" onClick={handleReset}>
                                Resetuj
                            </button>
                        </div>
                    </>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default ProfessionPopup;
