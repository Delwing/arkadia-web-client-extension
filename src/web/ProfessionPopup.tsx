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

    const inputStyle: React.CSSProperties = {
        background: 'var(--popup-input-bg)',
        border: '1px solid var(--popup-border-control)',
        borderRadius: 3,
        color: 'var(--popup-input-text)',
        padding: '2px 6px',
        fontSize: 11,
        fontFamily: 'monospace',
    };

    const btnStyle: React.CSSProperties = {
        padding: '2px 8px',
        border: '1px solid var(--popup-border-control)',
        borderRadius: 3,
        cursor: 'pointer',
        fontSize: 11,
        fontFamily: 'monospace',
        background: 'var(--popup-control-bg)',
        color: 'var(--popup-text-subtle)',
    };

    const saveBtnStyle: React.CSSProperties = {
        ...btnStyle,
        background: 'var(--popup-success-subtle-bg)',
        border: '1px solid var(--popup-success-border)',
        color: 'var(--popup-success)',
    };

    const dangerBtnStyle: React.CSSProperties = {
        ...btnStyle,
        background: 'var(--popup-danger-subtle-bg)',
        border: '1px solid var(--popup-danger-border)',
        color: 'var(--popup-danger)',
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
            <div style={{ fontFamily: 'monospace', fontSize: 12, padding: 8, color: 'var(--popup-text)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!state ? (
                    <div style={{ textAlign: 'center', padding: 16 }}>
                        <div style={{ color: 'var(--popup-text-dim)', marginBottom: 12 }}>Brak danych o zawodzie</div>
                        <button type="button" style={saveBtnStyle} onClick={handleInit}>
                            Rozpocznij trening
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Progress bar */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ color: 'var(--popup-text-subtle)' }}>Postep</span>
                                <span style={{ color: percentage >= 100 ? '#4a4' : '#ffd700', fontWeight: 'bold' }}>
                                    {percentage.toFixed(1)}%
                                </span>
                            </div>
                            <div style={{ background: '#222', borderRadius: 4, height: 14, overflow: 'hidden', border: '1px solid #333' }}>
                                <div style={{
                                    width: `${Math.min(percentage, 100)}%`,
                                    height: '100%',
                                    background: percentage >= 100 ? '#2a5a2a' : '#8b6914',
                                    transition: 'width 0.3s',
                                }} />
                            </div>
                            <div style={{ color: 'var(--popup-text-faint)', fontSize: 10, marginTop: 2, textAlign: 'right' }}>
                                {totalPoints} / {FULL_PROFESSION_POINTS} pkt
                            </div>
                        </div>

                        {/* Stats */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                            {/* Start time */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--popup-text-dim)' }}>Rozpoczecie:</span>
                                {editingStart ? (
                                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <input
                                            type="datetime-local"
                                            value={startInput}
                                            onChange={e => setStartInput(e.target.value)}
                                            style={{ ...inputStyle, width: 170 }}
                                        />
                                        <button type="button" style={saveBtnStyle} onClick={handleSaveStart}>OK</button>
                                        <button type="button" style={btnStyle} onClick={() => setEditingStart(false)}>X</button>
                                    </span>
                                ) : (
                                    <span
                                        style={{ color: 'var(--popup-text-bright)', cursor: 'pointer', borderBottom: '1px dashed var(--popup-border-control)' }}
                                        onClick={() => { setStartInput(formatDateInput(state.start_time)); setEditingStart(true); }}
                                        title="Kliknij aby edytowac"
                                    >
                                        {formatDate(state.start_time)}
                                    </span>
                                )}
                            </div>

                            {/* Weeks */}
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--popup-text-dim)' }}>Tygodnie:</span>
                                <span style={{ color: 'var(--popup-text-bright)' }}>{weeks} ({timePoints} pkt, {WEEKLY_POINTS}/tydz)</span>
                            </div>

                            {/* Next breakpoint */}
                            {secondsToNext > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--popup-text-dim)' }}>Nastepne +{WEEKLY_POINTS}:</span>
                                    <span style={{ color: 'var(--popup-data-blue)' }}>{formatTimeUntil(secondsToNext)}</span>
                                </div>
                            )}

                            {/* Plus events */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'var(--popup-text-dim)' }}>Bonusy (+staz):</span>
                                {editingPlus ? (
                                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <input
                                            type="number"
                                            min={0}
                                            value={plusInput}
                                            onChange={e => setPlusInput(e.target.value)}
                                            style={{ ...inputStyle, width: 50 }}
                                        />
                                        <button type="button" style={saveBtnStyle} onClick={handleSavePlus}>OK</button>
                                        <button type="button" style={btnStyle} onClick={() => setEditingPlus(false)}>X</button>
                                    </span>
                                ) : (
                                    <span
                                        style={{ color: 'var(--popup-text-bright)', cursor: 'pointer', borderBottom: '1px dashed var(--popup-border-control)' }}
                                        onClick={() => { setPlusInput(String(plusEventCount)); setEditingPlus(true); }}
                                        title="Kliknij aby edytowac"
                                    >
                                        {plusEventCount}x ({plusPoints} pkt, {PLUS_POINT}/bonus)
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 4, borderTop: '1px solid #333', paddingTop: 8 }}>
                            <button type="button" style={dangerBtnStyle} onClick={handleReset}>
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
