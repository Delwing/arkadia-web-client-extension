import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import eventBus from '@modules/core/eventBus';
import type {
    CoverEdge,
    CoverExpiryReason,
    CoverLogEntry,
    CoverStateObject,
    CoverStateSnapshot,
} from '@client/scripts/coverTracker';
import { ANY_ATTACKER } from '@client/coverPatterns';
import './CoverDebugPopup.css';

const POPUP_ID = 'popup:coverDebug';
/** The log is a debug tape, not a history - keep it short enough to stay readable. */
const LOG_LIMIT = 200;
/** `since` ticks live, so the table has to repaint without new events. */
const TICK_MS = 500;

const EMPTY_STATE: CoverStateSnapshot = { at: 0, edges: [], objects: [] };

const KIND_LABEL: Record<CoverLogEntry['kind'], string> = {
    'established': 'ZASLONA',
    'failed': 'NIEUDANE',
    'blocked': 'BLOKADA',
    'break-failed': 'PRZELAM-NIE',
    'break-ok': 'PRZELAM-OK',
    'released': 'KONIEC',
    'retreat': 'WYCOFANIE',
    'expired': 'WYGASLO',
    'gmcp-suspect': 'GMCP',
    'ambiguous': 'NIEJASNE',
};

/**
 * Several different things remove an edge. Saying which one fired is the difference
 * between the log answering "why did that go away" and merely restating that it did.
 */
const REASON_LABEL: Record<CoverExpiryReason, string> = {
    'gone': 'znikl z lokacji',
    'death': 'smierc',
    'stun': 'ogluszenie',
    'max-age': 'limit wieku',
    'superseded': 'zastapiona nowa zaslona',
    'now-covering': 'zaslaniany sam zaczal zaslaniac',
};

function seconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)} s`;
}

function clockTime(at: number): string {
    return new Date(at).toLocaleTimeString('pl-PL', { hour12: false });
}

interface Row {
    obj: CoverStateObject;
    /** Edges where this object is the protected one. */
    covered: CoverEdge[];
    /** Edges where this object does the protecting. */
    covering: CoverEdge[];
}

const CoverDebugPopup: React.FC = () => {
    const { wrapperProps } = usePopup<'cover.popup.open'>(POPUP_ID, {
        openEvent: 'cover.popup.open',
    });
    const [state, setState] = useState<CoverStateSnapshot>(EMPTY_STATE);
    const [log, setLog] = useState<CoverLogEntry[]>([]);
    const [hideGmcp, setHideGmcp] = usePopupSetting<boolean>(POPUP_ID, 'hideGmcp', false);
    const [, setTick] = useState(0);
    const unknownBlocks = useRef(0);

    useEffect(() => {
        const onState = (snapshot: CoverStateSnapshot) => setState(snapshot);
        const onEvent = (entry: CoverLogEntry) => {
            if (entry.kind === 'blocked' && entry.wasKnown === false) unknownBlocks.current += 1;
            setLog(prev => [entry, ...prev].slice(0, LOG_LIMIT));
        };
        eventBus.on('cover.state', onState);
        eventBus.on('cover.event', onEvent);
        const timer = setInterval(() => setTick(t => t + 1), TICK_MS);
        return () => {
            eventBus.off('cover.state', onState);
            eventBus.off('cover.event', onEvent);
            clearInterval(timer);
        };
    }, []);

    const nameOf = useMemo(() => {
        const byNum = new Map(state.objects.map(o => [o.num, o.desc]));
        return (id?: number) => {
            if (id === undefined) return '?';
            if (id === state.playerNum) return 'ty';
            if (id === ANY_ATTACKER) return 'wrogowie';
            return byNum.get(id) ?? `ob_${id}`;
        };
    }, [state]);

    const rows = useMemo<Row[]>(() => state.objects.map(obj => ({
        obj,
        covered: state.edges.filter(e => e.coveredId === obj.num),
        covering: state.edges.filter(e => e.covererId === obj.num),
    })), [state]);

    const team = rows.filter(r => r.obj.category === 'player' || r.obj.category === 'team');
    const enemies = rows.filter(r => r.obj.category !== 'player' && r.obj.category !== 'team');

    const visibleLog = hideGmcp ? log.filter(e => e.kind !== 'gmcp-suspect') : log;

    const headerActions = (
        <>
            <button
                type="button"
                className={`popup-btn popup-btn--sm${hideGmcp ? ' popup-btn--primary' : ''}`}
                onClick={() => setHideGmcp(!hideGmcp)}
                title="Ukryj wpisy wywnioskowane tylko z GMCP"
            >
                bez GMCP
            </button>
            <button
                type="button"
                className="popup-btn popup-btn--sm"
                onClick={() => { setLog([]); unknownBlocks.current = 0; }}
                title="Wyczysc log zdarzen"
            >
                Wyczysc
            </button>
        </>
    );

    /**
     * The point of the whole popup: a row is never simply covered or not, it is
     * covered against a SET of attackers. A target blocked for a teammate can be
     * wide open for you.
     */
    const attackerCell = (edges: CoverEdge[]) => {
        if (edges.length === 0) return null;
        const ids = [...new Set(edges.map(e => e.attackerId))];
        return (
            <>
                {ids.map((id, i) => (
                    <React.Fragment key={id}>
                        {i > 0 && ', '}
                        <span className={id === state.playerNum ? 'cover-dbg-me' : undefined}>
                            {nameOf(id)}
                        </span>
                    </React.Fragment>
                ))}
            </>
        );
    };

    const statusCell = (row: Row) => {
        if (row.covered.length > 0) {
            const blockedForMe = state.playerNum !== undefined
                && row.covered.some(e => e.attackerId === state.playerNum
                    // A standing cover over a mob is against us too.
                    || (e.attackerId === ANY_ATTACKER && row.obj.category.startsWith('rest')));
            const coverers = [...new Set(row.covered.map(e => e.covererId))];
            const suspected = row.covered.every(e => e.confidence === 'suspected');
            return (
                <span className={suspected ? 'cover-dbg-suspected' : undefined}>
                    <span className={blockedForMe ? 'cover-dbg-blocked' : 'cover-dbg-open'}>
                        {blockedForMe ? 'ZASLONIETY' : 'zaslaniany'}
                    </span>
                    {' przez '}
                    <em>{coverers.map(nameOf).join(', ')}</em>
                    {row.covered.map(e => (
                        <span key={`${e.covererId}:${e.attackerId}`} className="cover-dbg-tag">
                            {e.source}
                        </span>
                    ))}
                </span>
            );
        }
        if (row.covering.length > 0) {
            const targets = [...new Set(row.covering.map(e => e.coveredId))];
            return <>{'zaslania '}<em>{targets.map(nameOf).join(', ')}</em></>;
        }
        return <span className="cover-dbg-none">&mdash;</span>;
    };

    const sinceCell = (row: Row) => {
        const edges = row.covered.length > 0 ? row.covered : row.covering;
        if (edges.length === 0) return null;
        const since = Math.min(...edges.map(e => e.since));
        return seconds(Date.now() - since);
    };

    const renderGroup = (label: string, group: Row[]) => (
        <>
            <tr className="cover-dbg-group">
                <td colSpan={5}>{label}</td>
            </tr>
            {group.length === 0 ? (
                <tr><td colSpan={5} className="cover-dbg-none">brak</td></tr>
            ) : group.map(row => (
                <tr key={row.obj.num} className="zlom-row">
                    <td className={`zlom-cell${row.obj.category === 'player' ? ' cover-dbg-me' : ''}`}>
                        {row.obj.desc}
                    </td>
                    <td className="zlom-cell cover-dbg-num">ob_{row.obj.num}</td>
                    <td className="zlom-cell">{statusCell(row)}</td>
                    <td className="zlom-cell">{attackerCell(row.covered)}</td>
                    <td className="zlom-cell cover-dbg-since">{sinceCell(row)}</td>
                </tr>
            ))}
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="coverDebug"
            title={`Zaslony - debug (${state.edges.length})`}
            minWidth={420}
            minHeight={260}
            initialWidth={900}
            initialHeight={560}
            className="cover-dbg-popup"
            bodyClassName="cover-dbg-popup-body"
            headerActions={headerActions}
        >
            <div className="cover-dbg-counter">
                {/* The tracker grading itself: a non-zero value in a normal fight
                    means an establishing line was missed, not that this is noise. */}
                <span className={unknownBlocks.current > 0 ? 'cover-dbg-counter--bad' : undefined}>
                    nieznane blokady: {unknownBlocks.current}
                </span>
            </div>

            <div className="cover-dbg-state">
                <table className="zlom-table cover-dbg-table">
                    <thead>
                        <tr>
                            <th>opis</th>
                            <th>num</th>
                            <th>status</th>
                            <th>przed kim</th>
                            <th>od</th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderGroup('Druzyna', team)}
                        {renderGroup('Wrogowie', enemies)}
                    </tbody>
                </table>
            </div>

            <div className="cover-dbg-log">
                {visibleLog.length === 0 ? (
                    <div className="popup-empty">Brak zdarzen.</div>
                ) : visibleLog.map((entry, i) => (
                    <div key={`${entry.at}-${i}`} className="cover-dbg-log-entry">
                        <div className="cover-dbg-log-head">
                            <span className="cover-dbg-log-time">{clockTime(entry.at)}</span>
                            <span className={`cover-dbg-log-kind cover-dbg-log-kind--${entry.kind}`}>
                                {KIND_LABEL[entry.kind]}
                            </span>
                            <span className="cover-dbg-log-pair">
                                {entry.coveredName ?? nameOf(entry.coveredId)}
                                {/* A break line names no coverer, and by then there
                                    may have been several - say nothing rather than '?'. */}
                                {(entry.covererId !== undefined || entry.covererName) && (
                                    <>{' <- '}{entry.covererName ?? nameOf(entry.covererId)}</>
                                )}
                                {entry.attackerId !== undefined && ` (przed ${nameOf(entry.attackerId)})`}
                            </span>
                            <span className="cover-dbg-log-source">({entry.source})</span>
                            {entry.reason && (
                                <span className="cover-dbg-log-reason">
                                    {REASON_LABEL[entry.reason]}
                                    {entry.missingIds?.length
                                        ? `: ${entry.missingIds.map(nameOf).join(', ')}`
                                        : ''}
                                </span>
                            )}
                            {entry.wasKnown === false && (
                                <span className="cover-dbg-log-unknown">nieznana</span>
                            )}
                        </div>
                        {entry.raw && <div className="cover-dbg-log-raw">{entry.raw}</div>}
                    </div>
                ))}
            </div>
        </DockablePopupWrapper>
    );
};

export default CoverDebugPopup;
