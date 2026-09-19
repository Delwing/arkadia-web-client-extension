import React, { useEffect, useMemo, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { Table, TableCell, TableHeadCell, TableRow } from '@design';
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
            <div className="transport-times-debug">
                <div className="transport-times-debug__toolbar">
                    <input
                        type="text"
                        placeholder="Filtruj (nazwa, miasto)..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                        className="popup-input transport-times-debug__filter"
                    />
                    {/* Natywny <select>: @design/Select to listbox Radiksa, ktorego
                        Playwright nie steruje przez selectOption (DESIGN_SYSTEM.md). */}
                    <select
                        value={sortMode}
                        onChange={e => setSortMode(e.target.value as SortMode)}
                        className="popup-input transport-times-debug__sort"
                    >
                        <option value="name">Sort: nazwa</option>
                        <option value="updated">Sort: ostatnio</option>
                        <option value="recorded">Sort: zapisane</option>
                    </select>
                    <label className="transport-times-debug__only">
                        <input
                            type="checkbox"
                            checked={onlyRecorded}
                            onChange={e => setOnlyRecorded(e.target.checked)}
                        />
                        tylko zapisane
                    </label>
                </div>
                <div className="transport-times-debug__summary">
                    <span>{totals.transports} transportow, {totals.recorded}/{totals.legs} segmentow zapisanych</span>
                    <button
                        type="button"
                        onClick={() => eventBus.emit('transportTimesDebug.request')}
                        className="popup-btn transport-times-debug__refresh"
                    >
                        Odswiez
                    </button>
                </div>
                <div className="transport-times-debug__list">
                    {!payload && <div className="transport-times-debug__status">Ladowanie...</div>}
                    {payload && transports.length === 0 && (
                        <div className="transport-times-debug__status">Brak wynikow.</div>
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
        <div className="transport-times-debug__group">
            <div
                onClick={() => setOpen(o => !o)}
                className="transport-times-debug__group-header"
            >
                <span className="transport-times-debug__group-name">
                    {open ? '▾' : '▸'} {entry.name}
                </span>
                <span className="transport-times-debug__group-count">
                    {recordedCount}/{entry.legs.length}
                </span>
            </div>
            {open && (
                <Table compact className="transport-times-debug__table">
                    <thead>
                        <TableRow>
                            <TableHeadCell align="grow">leg</TableHeadCell>
                            <TableHeadCell align="num">now</TableHeadCell>
                            <TableHeadCell align="num">min</TableHeadCell>
                            <TableHeadCell align="num">max</TableHeadCell>
                            <TableHeadCell align="num">orig</TableHeadCell>
                            <TableHeadCell align="num">updated</TableHeadCell>
                            <TableHeadCell align="num"></TableHeadCell>
                        </TableRow>
                    </thead>
                    <tbody>
                        {entry.legs.map((l, i) => {
                            const overridden = l.shortest !== null
                                && l.originalTime !== null
                                && Math.abs((l.currentTime ?? l.originalTime) - l.originalTime) > 0.5;
                            return (
                                <TableRow key={i}>
                                    <TableCell align="grow">
                                        <span className="transport-times-debug__leg-index">{i}.</span>{' '}
                                        {l.fromLabel} <span className="transport-times-debug__leg-arrow">&rarr;</span> {l.toLabel}
                                        <span className="transport-times-debug__leg-ids">
                                            ({l.fromId}&rarr;{l.toId})
                                        </span>
                                    </TableCell>
                                    <TableCell
                                        align="num"
                                        className={overridden ? 'transport-times-debug__now--overridden' : undefined}
                                    >
                                        {formatSeconds(l.currentTime)}
                                    </TableCell>
                                    <TableCell align="num" className="transport-times-debug__min">
                                        {formatSeconds(l.shortest)}
                                    </TableCell>
                                    <TableCell align="num" tone="muted">
                                        {formatSeconds(l.longest)}
                                    </TableCell>
                                    <TableCell align="num" tone="muted">
                                        {formatSeconds(l.originalTime)}
                                    </TableCell>
                                    <TableCell align="num" tone="muted" className="transport-times-debug__updated">
                                        {formatRelative(l.updatedAt)}
                                    </TableCell>
                                    <TableCell align="num">
                                        <button
                                            type="button"
                                            title="Skasuj zapisany czas (przywroc oryginalny)"
                                            disabled={l.shortest === null}
                                            onClick={() => resetLeg(l.fromId, l.toId)}
                                            className="popup-btn popup-btn--sm transport-times-debug__reset"
                                        >
                                            reset
                                        </button>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </tbody>
                </Table>
            )}
        </div>
    );
};

export default TransportTimesDebugPopup;
