import React, { useEffect, useMemo, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import type { TransportTimesDebugPayload, TransportTimesDebugEntry } from '@client/types/transport';

const POPUP_ID = 'popup:transport-times-debug';

function formatSeconds(seconds: number | null): string {
    if (seconds === null || Number.isNaN(seconds)) return '—';
    if (seconds < 60) {
        return seconds < 10 ? seconds.toFixed(1) + 's' : Math.round(seconds) + 's';
    }
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRelative(updatedAt: number | null): string {
    if (!updatedAt) return '';
    const diffMs = Date.now() - updatedAt;
    if (diffMs < 0) return '';
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}s temu`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m temu`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h temu`;
    const days = Math.floor(hr / 24);
    return `${days}d temu`;
}

type SortMode = 'name' | 'updated' | 'recorded';

const TransportTimesDebugPopup: React.FC = () => {
    const { wrapperProps, setIsOpen } = usePopup(POPUP_ID);
    const [payload, setPayload] = useState<TransportTimesDebugPayload | null>(null);
    const [filter, setFilter] = useState('');
    const [sortMode, setSortMode] = useState<SortMode>('name');
    const [onlyRecorded, setOnlyRecorded] = useState(false);

    useEffect(() => eventBus.on('transportTimesDebug.popup.toggle', () => setIsOpen(v => !v)), [setIsOpen]);

    useEffect(() => eventBus.on('transportTimesDebug', (data) => setPayload(data)), []);

    useEffect(() => {
        if (wrapperProps.isOpen) {
            eventBus.emit('transportTimesDebug.request');
        }
    }, [wrapperProps.isOpen]);

    const transports = useMemo(() => {
        if (!payload) return [];
        const needle = filter.trim().toLowerCase();
        let list = payload.transports;
        if (needle) {
            list = list.filter(t =>
                t.name.toLowerCase().includes(needle)
                || t.legs.some(l =>
                    l.fromLabel.toLowerCase().includes(needle)
                    || l.toLabel.toLowerCase().includes(needle))
            );
        }
        if (onlyRecorded) {
            list = list
                .map(t => ({ ...t, legs: t.legs.filter(l => l.shortest !== null) }))
                .filter(t => t.legs.length > 0);
        }
        const sorted = [...list];
        if (sortMode === 'name') {
            sorted.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortMode === 'updated') {
            const newest = (t: TransportTimesDebugEntry) =>
                t.legs.reduce((max, l) => Math.max(max, l.updatedAt ?? 0), 0);
            sorted.sort((a, b) => newest(b) - newest(a));
        } else {
            const count = (t: TransportTimesDebugEntry) =>
                t.legs.reduce((n, l) => n + (l.shortest !== null ? 1 : 0), 0);
            sorted.sort((a, b) => count(b) - count(a));
        }
        return sorted;
    }, [payload, filter, sortMode, onlyRecorded]);

    const totals = useMemo(() => {
        if (!payload) return { transports: 0, legs: 0, recorded: 0 };
        let legs = 0;
        let recorded = 0;
        for (const t of payload.transports) {
            for (const l of t.legs) {
                legs++;
                if (l.shortest !== null) recorded++;
            }
        }
        return { transports: payload.transports.length, legs, recorded };
    }, [payload]);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="transport-times-debug"
            title="Transport times (debug)"
            minWidth={420}
            minHeight={280}
            initialWidth={520}
            initialHeight={520}
            className="transport-times-debug-popup"
            bodyClassName="transport-times-debug-popup-body"
        >
            <div style={{
                fontFamily: 'monospace', fontSize: 11, padding: 8,
                color: 'var(--popup-text)', display: 'flex', flexDirection: 'column',
                height: '100%', overflow: 'hidden',
            }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        placeholder="Filtruj (nazwa, miasto)..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        style={{
                            flex: '1 1 160px', minWidth: 140,
                            background: 'var(--popup-input-bg)',
                            border: '1px solid var(--popup-border-control)',
                            borderRadius: 3, color: 'var(--popup-input-text)',
                            padding: '3px 6px', fontSize: 11, fontFamily: 'monospace',
                        }}
                    />
                    <select
                        value={sortMode}
                        onChange={e => setSortMode(e.target.value as SortMode)}
                        style={{
                            background: 'var(--popup-control-bg)',
                            border: '1px solid var(--popup-border-control)',
                            borderRadius: 3, color: 'var(--popup-text-subtle)',
                            padding: '3px 6px', fontSize: 11, fontFamily: 'monospace',
                        }}
                    >
                        <option value="name">Sort: nazwa</option>
                        <option value="updated">Sort: ostatnio</option>
                        <option value="recorded">Sort: zapisane</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--popup-text-dim)' }}>
                        <input
                            type="checkbox"
                            checked={onlyRecorded}
                            onChange={e => setOnlyRecorded(e.target.checked)}
                        />
                        tylko zapisane
                    </label>
                </div>
                <div style={{
                    fontSize: 10, color: 'var(--popup-text-dim)',
                    marginBottom: 6, display: 'flex', justifyContent: 'space-between',
                }}>
                    <span>{totals.transports} transportow, {totals.recorded}/{totals.legs} segmentow zapisanych</span>
                    <button
                        type="button"
                        onClick={() => eventBus.emit('transportTimesDebug.request')}
                        style={{
                            padding: '2px 8px', fontSize: 10, fontFamily: 'monospace',
                            background: 'var(--popup-control-bg)',
                            border: '1px solid var(--popup-border-control)',
                            borderRadius: 3, color: 'var(--popup-text-subtle)',
                            cursor: 'pointer',
                        }}
                    >
                        Odswiez
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
                    {!payload && <div style={{ color: 'var(--popup-text-dim)' }}>Ladowanie...</div>}
                    {payload && transports.length === 0 && (
                        <div style={{ color: 'var(--popup-text-dim)' }}>Brak wynikow.</div>
                    )}
                    {transports.map(t => (
                        <TransportSection key={t.name} entry={t} />
                    ))}
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

interface TransportSectionProps {
    entry: TransportTimesDebugEntry;
}

const TransportSection: React.FC<TransportSectionProps> = ({ entry }) => {
    const [open, setOpen] = useState(true);
    const recordedCount = entry.legs.filter(l => l.shortest !== null).length;
    const resetLeg = (fromId: number, toId: number) => {
        eventBus.emit('transportTimesDebug.resetLeg', { transport: entry.name, fromId, toId });
    };
    return (
        <div style={{ marginBottom: 8 }}>
            <div
                onClick={() => setOpen(o => !o)}
                style={{
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                    alignItems: 'baseline', padding: '3px 4px',
                    background: 'var(--popup-subtle-bg)',
                    borderRadius: 3, marginBottom: 2,
                }}
            >
                <span style={{ color: 'var(--popup-text-bright)', fontWeight: 'bold' }}>
                    {open ? '▾' : '▸'} {entry.name}
                </span>
                <span style={{ color: 'var(--popup-text-dim)', fontSize: 10 }}>
                    {recordedCount}/{entry.legs.length}
                </span>
            </div>
            {open && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                        <tr style={{ color: 'var(--popup-text-dim)', textAlign: 'right' }}>
                            <th style={{ textAlign: 'left', padding: '2px 4px', fontWeight: 'normal' }}>leg</th>
                            <th style={{ padding: '2px 4px', fontWeight: 'normal' }}>now</th>
                            <th style={{ padding: '2px 4px', fontWeight: 'normal' }}>min</th>
                            <th style={{ padding: '2px 4px', fontWeight: 'normal' }}>max</th>
                            <th style={{ padding: '2px 4px', fontWeight: 'normal' }}>orig</th>
                            <th style={{ padding: '2px 4px', fontWeight: 'normal' }}>updated</th>
                            <th style={{ padding: '2px 4px', fontWeight: 'normal' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {entry.legs.map((l, i) => {
                            const overridden = l.shortest !== null
                                && l.originalTime !== null
                                && Math.abs((l.currentTime ?? l.originalTime) - l.originalTime) > 0.5;
                            return (
                                <tr key={i} style={{ borderTop: '1px solid var(--popup-subtle-bg)' }}>
                                    <td style={{ padding: '2px 4px', color: 'var(--popup-text)' }}>
                                        <span style={{ color: 'var(--popup-text-dim)' }}>{i}.</span>{' '}
                                        {l.fromLabel} <span style={{ color: 'var(--popup-text-dim)' }}>&rarr;</span> {l.toLabel}
                                        <span style={{ color: 'var(--popup-text-dim)', marginLeft: 6, fontSize: 10 }}>
                                            ({l.fromId}&rarr;{l.toId})
                                        </span>
                                    </td>
                                    <td style={{
                                        padding: '2px 4px', textAlign: 'right',
                                        color: overridden ? 'var(--popup-data-gold)' : 'var(--popup-text)',
                                    }}>
                                        {formatSeconds(l.currentTime)}
                                    </td>
                                    <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--popup-success)' }}>
                                        {formatSeconds(l.shortest)}
                                    </td>
                                    <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--popup-text-dim)' }}>
                                        {formatSeconds(l.longest)}
                                    </td>
                                    <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--popup-text-dim)' }}>
                                        {formatSeconds(l.originalTime)}
                                    </td>
                                    <td style={{ padding: '2px 4px', textAlign: 'right', color: 'var(--popup-text-dim)', fontSize: 10 }}>
                                        {formatRelative(l.updatedAt)}
                                    </td>
                                    <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                                        <button
                                            type="button"
                                            title="Skasuj zapisany czas (przywroc oryginalny)"
                                            disabled={l.shortest === null}
                                            onClick={() => resetLeg(l.fromId, l.toId)}
                                            style={{
                                                padding: '1px 6px', fontSize: 10, fontFamily: 'monospace',
                                                background: 'var(--popup-control-bg)',
                                                border: '1px solid var(--popup-border-control)',
                                                borderRadius: 3,
                                                color: l.shortest === null ? 'var(--popup-text-dim)' : 'var(--popup-text-subtle)',
                                                cursor: l.shortest === null ? 'default' : 'pointer',
                                                opacity: l.shortest === null ? 0.4 : 1,
                                            }}
                                        >
                                            reset
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export default TransportTimesDebugPopup;
