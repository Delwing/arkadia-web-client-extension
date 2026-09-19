import React, { useCallback, useEffect, useMemo, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { gmcp } from '../client/gmcp';
import {
    CECHA_LABELS,
    CECHA_MAX_LEVEL,
    CECHA_ORDER,
    CECHA_STEPS,
    CechaKey,
    LEVEL_THRESHOLDS,
    describeLevel,
} from '../client/scripts/lvlCalc';
import {
    CechyHistoryEntry,
    CechyStat,
    clearCechyHistory,
    findLastKnownStat,
    getCechyHistory,
} from '../client/scripts/cechyHistory';

const POPUP_ID = 'popup:cechy';

type TabType = 'stan' | 'wykres';

/** A trait that moved between two consecutive recorded read-outs. */
interface TraitChange {
    key: CechaKey;
    /** Previous reading, or undefined when the trait was measured for the first time. */
    from?: CechyStat;
    to: CechyStat;
    /** Change in subcech; 0 for a first measurement. */
    delta: number;
}

function traitChanges(entries: CechyHistoryEntry[], index: number): TraitChange[] {
    const entry = entries[index];
    const changes: TraitChange[] = [];
    for (const key of CECHA_ORDER) {
        const to = entry.stats[key];
        if (!to) continue;
        const from = findLastKnownStat(entries, key, index);
        if (!from) {
            changes.push({ key, to, delta: 0 });
        } else if (from.value !== to.value || from.step !== to.step) {
            changes.push({ key, from, to, delta: to.sum - from.sum });
        }
    }
    return changes;
}

function formatDate(time: number) {
    return new Date(time).toLocaleString('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatShortDate(time: number) {
    return new Date(time).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
}

function formatRelative(time: number, now: number) {
    const seconds = Math.max(0, Math.round((now - time) / 1000));
    if (seconds < 60) return 'przed chwila';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min temu`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} godz. temu`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} dni temu`;
    const months = Math.round(days / 30);
    if (months < 12) return `${months} mies. temu`;
    return `${Math.round(months / 12)} lat temu`;
}

function formatDelta(delta: number) {
    return delta > 0 ? `+${delta}` : String(delta);
}

/** Polish plural form: 1 postep / 2-4 postepy / 5+ postepow. */
function plural(count: number, one: string, few: string, many: string) {
    const abs = Math.abs(Math.round(count));
    if (abs === 1) return one;
    const last = abs % 10;
    const lastTwo = abs % 100;
    return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

/**
 * How many postepy were counted between a read-out and the one before it.
 * Undefined when either side predates the global counter having any data.
 */
function postepyCost(entries: CechyHistoryEntry[], index: number): number | undefined {
    if (index === 0) return undefined;
    const before = entries[index - 1].postepy;
    const after = entries[index].postepy;
    if (before === undefined || after === undefined) return undefined;
    return after - before;
}

/** A row of discrete cells, used for both the 1..10 level and the 0..4 step. */
const Meter: React.FC<{ filled: number; total: number; variant?: string }> = ({ filled, total, variant }) => (
    <span className={`cechy-popup__meter${variant ? ` cechy-popup__meter--${variant}` : ''}`}>
        {Array.from({ length: total }, (_, i) => (
            <span
                key={i}
                className={`cechy-popup__meter-cell${i < filled ? ' cechy-popup__meter-cell--on' : ''}`}
            />
        ))}
    </span>
);

const CHART_W = 300;
const CHART_H = 110;
/** Room for the subcech labels on the left, dates below, and the top dot. */
const CHART_PAD = { left: 26, right: 8, top: 8, bottom: 16 };

/**
 * Totals over time. Autoscaling alone produces a meaningless squiggle, so the
 * plot is anchored: the subcech range is labelled and every experience-level
 * threshold inside it is drawn, which is what a rise actually has to cross.
 */
const TotalChart: React.FC<{ entries: CechyHistoryEntry[] }> = ({ entries }) => {
    if (entries.length < 2) return null;

    const totals = entries.map((entry) => entry.total);
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    // Give a flat line some breathing room instead of gluing it to an edge.
    const low = min === max ? min - 2 : min;
    const high = min === max ? max + 2 : max;

    const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
    const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
    const baseline = CHART_PAD.top + plotH;
    const xOf = (index: number) => CHART_PAD.left + (index / (entries.length - 1)) * plotW;
    const yOf = (total: number) =>
        CHART_PAD.top + (1 - (total - low) / (high - low)) * plotH;

    const points = entries.map((entry, index) => `${xOf(index).toFixed(1)},${yOf(entry.total).toFixed(1)}`);
    const thresholds = LEVEL_THRESHOLDS.filter((value) => value > low && value < high);

    return (
        <svg className="cechy-popup__chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
            {/* Range bounds */}
            {[high, low].map((value) => (
                <g key={`axis-${value}`}>
                    <line
                        className="cechy-popup__chart-grid"
                        x1={CHART_PAD.left}
                        x2={CHART_W - CHART_PAD.right}
                        y1={yOf(value)}
                        y2={yOf(value)}
                    />
                    <text
                        className="cechy-popup__chart-label"
                        x={CHART_PAD.left - 4}
                        y={yOf(value) + 2.5}
                        textAnchor="end"
                    >
                        {value}
                    </text>
                </g>
            ))}

            {/* Experience-level thresholds crossed by this range */}
            {thresholds.map((value) => (
                <g key={`level-${value}`}>
                    <line
                        className="cechy-popup__chart-threshold"
                        x1={CHART_PAD.left}
                        x2={CHART_W - CHART_PAD.right}
                        y1={yOf(value)}
                        y2={yOf(value)}
                    />
                    <text
                        className="cechy-popup__chart-label cechy-popup__chart-label--level"
                        x={CHART_PAD.left - 4}
                        y={yOf(value) + 2.5}
                        textAnchor="end"
                    >
                        {value}
                    </text>
                </g>
            ))}

            <polyline className="cechy-popup__chart-line" points={points.join(' ')} />

            {entries.map((entry, index) => (
                <circle
                    key={`${entry.time}-${index}`}
                    className="cechy-popup__chart-dot"
                    cx={xOf(index)}
                    cy={yOf(entry.total)}
                    r={2}
                >
                    <title>{`${formatDate(entry.time)} — ${entry.total} podcech`}</title>
                </circle>
            ))}

            <text
                className="cechy-popup__chart-label"
                x={CHART_PAD.left}
                y={baseline + 11}
                textAnchor="start"
            >
                {formatShortDate(entries[0].time)}
            </text>
            <text
                className="cechy-popup__chart-label"
                x={CHART_W - CHART_PAD.right}
                y={baseline + 11}
                textAnchor="end"
            >
                {formatShortDate(entries[entries.length - 1].time)}
            </text>
        </svg>
    );
};

const CechyPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, { openEvent: 'cechy.popup.open' });
    const [entries, setEntries] = useState<CechyHistoryEntry[]>([]);
    const [confirmingClear, setConfirmingClear] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [modifiersEnabled, setModifiersEnabled] = useState(false);
    const [activeTab, setActiveTab] = usePopupSetting<TabType>(POPUP_ID, 'activeTab', 'stan');

    /** Re-reads the GMCP mirror, which the popup cannot observe directly. */
    const refreshModifiers = useCallback(() => {
        setModifiersEnabled(gmcp?.char?.options?.state_modifiers === 1);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setEntries([...getCechyHistory()]);
            setNow(Date.now());
            setConfirmingClear(false);
            refreshModifiers();
        }
    }, [isOpen, refreshModifiers]);

    useEffect(() => eventBus.on('gmcp.char.options', refreshModifiers), [refreshModifiers]);

    useEffect(() => {
        return eventBus.on('cechy.history.updated', () => {
            setEntries([...getCechyHistory()]);
            setNow(Date.now());
        });
    }, []);

    const latest = entries[entries.length - 1];
    const level = useMemo(() => (latest ? describeLevel(latest.total) : null), [latest]);
    /** A single read-out plots nothing, so fall back rather than show a blank tab. */
    const tab: TabType = entries.length < 2 ? 'stan' : activeTab;

    /** Current state per trait, plus the read-out at which it last moved. */
    const traits = useMemo(() => {
        return CECHA_ORDER.map((key) => {
            const stat = findLastKnownStat(entries, key);
            let change: TraitChange | undefined;
            let changedAt: number | undefined;
            for (let i = entries.length - 1; i >= 0; i--) {
                const found = traitChanges(entries, i).find((c) => c.key === key && c.delta !== 0);
                if (found) {
                    change = found;
                    changedAt = entries[i].time;
                    break;
                }
            }
            return { key, stat, change, changedAt };
        });
    }, [entries]);

    /** Newest first — the most recent change is what you came to check. */
    const timeline = useMemo(() => {
        return entries
            .map((entry, index) => ({
                entry,
                index,
                changes: traitChanges(entries, index),
                totalDelta: index > 0 ? entry.total - entries[index - 1].total : 0,
                postepy: postepyCost(entries, index),
            }))
            .reverse();
    }, [entries]);

    const handleClear = useCallback(() => {
        if (!confirmingClear) {
            setConfirmingClear(true);
            return;
        }
        clearCechyHistory();
        setConfirmingClear(false);
    }, [confirmingClear]);

    const headerActions = (
        <>
            {latest && (
                <span className="cechy-popup__total" title="Suma podcech">
                    {latest.estimated ? '~' : ''}{latest.total}
                </span>
            )}
            {entries.length > 0 && (
                <button
                    type="button"
                    className={`popup-btn popup-btn--sm${confirmingClear ? ' popup-btn--danger' : ''}`}
                    onClick={handleClear}
                    title="Wyczysc historie cech"
                >
                    {confirmingClear ? 'Na pewno?' : 'Wyczysc'}
                </button>
            )}
        </>
    );

    const handleEnableModifiers = useCallback(() => {
        eventBus.emit('cechy.enableModifiers');
        refreshModifiers();
    }, [refreshModifiers]);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="cechy"
            title="Cechy"
            minWidth={300}
            minHeight={220}
            initialWidth={440}
            initialHeight={560}
            className="cechy-popup"
            bodyClassName="cechy-popup-body"
            headerActions={headerActions}
        >
            {!modifiersEnabled && (
                <div className="cechy-popup__warning">
                    <div className="cechy-popup__warning-title">Historia nie jest zapisywana</div>
                    <p className="cechy-popup__warning-text">
                        Wymagana jest opcja <code>MODYFIKATORY stanu postaci</code> &mdash; bez niej
                        nie da sie odroznic prawdziwej zmiany cechy od chwilowego wzmocnienia.
                    </p>
                    <button
                        type="button"
                        className="popup-btn popup-btn--md cechy-popup__warning-btn"
                        onClick={handleEnableModifiers}
                        title="To samo co: opcje modyfikatory wlacz"
                    >
                        Wlacz modyfikatory
                    </button>
                </div>
            )}

            {!latest || !level ? (
                <div className="popup-empty">
                    Brak zapisanych cech. Wpisz <code>cechy</code>, zeby zrobic pierwszy pomiar.
                </div>
            ) : (
                <>
                    <div className="popup-tabs">
                        <button
                            type="button"
                            className={`popup-tab${tab === 'stan' ? ' popup-tab--active' : ''}`}
                            onClick={() => setActiveTab('stan')}
                        >
                            Stan
                        </button>
                        <button
                            type="button"
                            className={`popup-tab${tab === 'wykres' ? ' popup-tab--active' : ''}`}
                            onClick={() => setActiveTab('wykres')}
                            disabled={entries.length < 2}
                            title={entries.length < 2 ? 'Wykres pojawi sie po drugiej zmianie' : undefined}
                        >
                            Wykres
                        </button>
                    </div>

                    {tab === 'wykres' ? (
                        <section className="cechy-popup__chart-tab">
                            <TotalChart entries={entries} />
                            <div className="cechy-popup__chart-legend">
                                Przerywane linie to progi poziomow doswiadczenia.
                            </div>
                        </section>
                    ) : (
                <>
                    <section className="cechy-popup__level">
                        <div className="cechy-popup__level-name">{level.name}</div>
                        <div className="cechy-popup__bar">
                            <div
                                className="cechy-popup__bar-fill"
                                style={{
                                    width: level.to === null
                                        ? '100%'
                                        : `${Math.max(0, Math.min(100,
                                            ((level.total - level.from) / (level.to - level.from)) * 100))}%`,
                                }}
                            />
                        </div>
                        <div className="cechy-popup__level-meta">
                            <span>{level.from}</span>
                            {level.to === null ? (
                                <span className="cechy-popup__level-missing">+{level.extra} podcech</span>
                            ) : (
                                <span className="cechy-popup__level-missing">
                                    brakuje {level.missing} do: {level.nextName}
                                </span>
                            )}
                            <span>{level.to ?? level.total}</span>
                        </div>
                    </section>

                    <section className="cechy-popup__traits">
                        {traits.map(({ key, stat, change, changedAt }) => (
                            <div key={key} className="cechy-popup__trait">
                                <span className="cechy-popup__trait-name">{CECHA_LABELS[key]}</span>
                                {stat ? (
                                    <>
                                        <Meter filled={stat.value} total={CECHA_MAX_LEVEL} />
                                        <Meter filled={stat.step} total={CECHA_STEPS} variant="step" />
                                        <span className="cechy-popup__trait-sum">{stat.sum}</span>
                                        {change && changedAt ? (
                                            <span
                                                className="cechy-popup__trait-change"
                                                title={formatDate(changedAt)}
                                            >
                                                <span
                                                    className={`cechy-popup__badge cechy-popup__badge--${change.delta > 0 ? 'up' : 'down'}`}
                                                >
                                                    {formatDelta(change.delta)}
                                                </span>
                                                <span className="cechy-popup__trait-when">
                                                    {formatRelative(changedAt, now)}
                                                </span>
                                            </span>
                                        ) : (
                                            <span className="cechy-popup__trait-change">
                                                bez zmian
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <span className="cechy-popup__trait-change">
                                        brak pomiaru
                                    </span>
                                )}
                            </div>
                        ))}
                    </section>

                    <section className="cechy-popup__timeline">
                        {timeline.map(({ entry, index, changes, totalDelta, postepy }) => (
                            <div key={`${entry.time}-${index}`} className="cechy-popup__entry">
                                <div className="cechy-popup__entry-head">
                                    <span className="cechy-popup__entry-date" title={formatRelative(entry.time, now)}>
                                        {formatDate(entry.time)}
                                    </span>
                                    {postepy !== undefined && postepy > 0 && (
                                        <span
                                            className="cechy-popup__entry-postepy"
                                            title="Postepy zdobyte od poprzedniej zmiany"
                                        >
                                            {postepy} {plural(postepy, 'postep', 'postepy', 'postepow')}
                                        </span>
                                    )}
                                    <span
                                        className="cechy-popup__entry-total"
                                        title={entry.estimated ? 'Suma zawiera cechy przeniesione z wczesniejszego pomiaru' : undefined}
                                    >
                                        {entry.estimated ? '~' : ''}{entry.total}
                                    </span>
                                    {totalDelta !== 0 && (
                                        <span
                                            className={`cechy-popup__badge cechy-popup__badge--${totalDelta > 0 ? 'up' : 'down'}`}
                                        >
                                            {formatDelta(totalDelta)}
                                        </span>
                                    )}
                                </div>
                                <div className="cechy-popup__entry-changes">
                                    {index === 0 && changes.every((c) => c.delta === 0) ? (
                                        <span className="cechy-popup__entry-note">pierwszy pomiar</span>
                                    ) : changes.length === 0 ? (
                                        <span className="cechy-popup__entry-note">brak zmian</span>
                                    ) : (
                                        changes.map((change) => (
                                            <span key={change.key} className="cechy-popup__chip">
                                                {CECHA_LABELS[change.key]}{' '}
                                                {change.from ? (
                                                    <>
                                                        {change.from.value}/{change.from.step} &rarr;{' '}
                                                        {change.to.value}/{change.to.step}
                                                        <span
                                                            className={`cechy-popup__chip-delta cechy-popup__chip-delta--${change.delta > 0 ? 'up' : 'down'}`}
                                                        >
                                                            {formatDelta(change.delta)}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        {change.to.value}/{change.to.step}
                                                        <span className="cechy-popup__chip-delta">nowa</span>
                                                    </>
                                                )}
                                            </span>
                                        ))
                                    )}
                                </div>
                            </div>
                        ))}
                    </section>
                </>
                    )}
                </>
            )}
        </DockablePopupWrapper>
    );
};

export default CechyPopup;
