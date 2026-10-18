import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import eventBus from '@modules/core/eventBus';
import type { LineTraceEntry, LineTraceOutcome, LineTracePass, LineTraceStep } from '@client/lineTrace.ts';
import { Button, HeaderButton, Input, Segmented } from '@web-ui/primitives';
import './LineInspectorPopup.css';

const POPUP_ID = 'popup:lineInspector';
/** Enough to scroll back through a fight, small enough that every entry's HTML stays cheap. */
const LIMIT = 1000;
/** Lines arrive in bursts; one render per burst, not per line. */
const FLUSH_MS = 100;

/**
 * No "has triggers" filter: catch-all triggers (`^`, `(.+)`) match every line,
 * so it would hide nothing. Search by trigger name finds where one fired.
 */
type Filter = 'all' | 'changed' | 'deleted';

const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Wszystkie' },
    { value: 'changed', label: 'Zmienione' },
    { value: 'deleted', label: 'Usunięte' },
];

const PASS_LABEL: Record<LineTracePass, string> = {
    multiline: 'wielolinia',
    line: 'linia',
    token: 'słowo',
};

const OUTCOME_LABEL: Record<LineTraceOutcome, string> = {
    kept: 'bez zmian',
    changed: 'zmienił',
    deleted: 'usunął',
};

function isChanged(entry: LineTraceEntry): boolean {
    return entry.final === null || entry.steps.some(s => s.outcome !== 'kept');
}

function matchesFilter(entry: LineTraceEntry, filter: Filter): boolean {
    switch (filter) {
        case 'changed': return isChanged(entry);
        case 'deleted': return entry.final === null;
        default: return true;
    }
}

function matchesQuery(entry: LineTraceEntry, query: string): boolean {
    if (!query) return true;
    return entry.raw.toLowerCase().includes(query)
        || (entry.final?.toLowerCase().includes(query) ?? false)
        || entry.steps.some(s => s.trigger.toLowerCase().includes(query));
}

function clockTime(at: number): string {
    return new Date(at).toLocaleTimeString('pl-PL', { hour12: false });
}

/** Inline {__html} objects re-parse on every render; keep them stable per entry. */
const Html: React.FC<{ html: string; className?: string }> = memo(({ html, className }) => {
    const inner = useMemo(() => ({ __html: html }), [html]);
    return <span className={className} dangerouslySetInnerHTML={inner} />;
});

const Row: React.FC<{
    entry: LineTraceEntry;
    showFinal: boolean;
    selected: boolean;
    onSelect: (id: number) => void;
}> = memo(({ entry, showFinal, selected, onSelect }) => {
    const deleted = entry.final === null;
    const changed = isChanged(entry);
    const html = showFinal && !deleted ? entry.finalHtml! : entry.rawHtml;
    return (
        <div
            className={`line-insp-row${selected ? ' is-selected' : ''}${deleted ? ' is-deleted' : ''}`}
            onClick={() => onSelect(entry.id)}
        >
            <span className="line-insp-mark" title={deleted ? 'usunięta' : changed ? 'zmieniona' : undefined}>
                {deleted ? '✕' : changed ? '✎' : ''}
            </span>
            <span className="line-insp-count" title="dopasowane triggery">
                {entry.steps.length || ''}
            </span>
            <Html className="line-insp-text" html={html} />
        </div>
    );
});

const StepRow: React.FC<{ step: LineTraceStep; index: number }> = ({ step, index }) => (
    <div className={`line-insp-step line-insp-step--${step.outcome}`}>
        <div className="line-insp-step-head">
            <span className="line-insp-step-index">{index + 1}.</span>
            <span className="line-insp-step-pass">{PASS_LABEL[step.pass]}{step.child ? ' · dziecko' : ''}</span>
            <span className="line-insp-step-name" title={step.trigger}>{step.trigger}</span>
            <span className="line-insp-step-outcome">{OUTCOME_LABEL[step.outcome]}</span>
            <span className="line-insp-step-ms">{step.ms.toFixed(2)} ms</span>
        </div>
        {step.outcome === 'changed' && (
            <div className="line-insp-step-diff">
                <div><span className="line-insp-label">przed</span><Html className="line-insp-game" html={step.beforeHtml!} /></div>
                <div><span className="line-insp-label">po</span><Html className="line-insp-game" html={step.afterHtml!} /></div>
            </div>
        )}
    </div>
);

const Detail: React.FC<{ entry: LineTraceEntry }> = ({ entry }) => (
    <div className="line-insp-detail">
        <div className="line-insp-detail-head">
            <span>{clockTime(entry.at)}</span>
            {entry.type && <span className="line-insp-type">{entry.type}</span>}
            <span className="line-insp-detail-spacer" />
            <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(entry.raw)}>
                Kopiuj surową
            </Button>
            {entry.final !== null && (
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(entry.final!)}>
                    Kopiuj wynik
                </Button>
            )}
        </div>
        <div className="line-insp-detail-line">
            <span className="line-insp-label">surowa</span>
            <Html className="line-insp-game line-insp-raw" html={entry.rawHtml} />
        </div>
        <div className="line-insp-detail-line">
            <span className="line-insp-label">wynik</span>
            {entry.finalHtml === null
                ? <span className="line-insp-gone">usunięta</span>
                : <Html className="line-insp-game line-insp-final" html={entry.finalHtml} />}
        </div>
        {entry.steps.length === 0
            ? <div className="popup-empty">Żaden trigger nie dopasował tej linii.</div>
            : <div className="line-insp-steps">
                {entry.steps.map((step, i) => <StepRow key={i} step={step} index={i} />)}
            </div>}
    </div>
);

const LineInspectorPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup<'lineInspector.popup.open'>(POPUP_ID, {
        openEvent: 'lineInspector.popup.open',
    });
    const [entries, setEntries] = useState<LineTraceEntry[]>([]);
    const [paused, setPaused] = useState(false);
    const [filter, setFilter] = usePopupSetting<Filter>(POPUP_ID, 'filter', 'all');
    const [showFinal, setShowFinal] = usePopupSetting<boolean>(POPUP_ID, 'showFinal', false);
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);

    // Recording costs a little on every line, so it runs only while the window is open.
    const recording = isOpen && !paused;
    useEffect(() => {
        if (!recording) return;
        const pending: LineTraceEntry[] = [];
        let timer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
            timer = null;
            const batch = pending.splice(0);
            setEntries(prev => {
                const next = prev.concat(batch);
                return next.length > LIMIT ? next.slice(next.length - LIMIT) : next;
            });
        };
        const off = eventBus.on('lineTrace.entry', (entry) => {
            pending.push(entry);
            timer ??= setTimeout(flush, FLUSH_MS);
        });
        eventBus.emit('lineTrace.enable', true);
        return () => {
            eventBus.emit('lineTrace.enable', false);
            off();
            if (timer) clearTimeout(timer);
            flush();
        };
    }, [recording]);

    const needle = query.trim().toLowerCase();
    const visible = useMemo(
        () => entries.filter(e => matchesFilter(e, filter) && matchesQuery(e, needle)),
        [entries, filter, needle],
    );
    const selected = selectedId === null ? undefined : entries.find(e => e.id === selectedId);

    useLayoutEffect(() => {
        const list = listRef.current;
        if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
    }, [visible]);

    const onScroll = () => {
        const list = listRef.current;
        if (!list) return;
        stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 8;
    };

    const headerActions = (
        <>
            <Segmented size="sm" value={filter} options={FILTERS} onChange={setFilter} />
            <HeaderButton
                active={showFinal}
                onClick={() => setShowFinal(!showFinal)}
                title="Pokaż linie po triggerach zamiast surowych"
            >
                Wynik
            </HeaderButton>
            <HeaderButton
                active={paused}
                onClick={() => setPaused(!paused)}
                title="Wstrzymaj zapisywanie nowych linii"
            >
                Pauza
            </HeaderButton>
            <HeaderButton onClick={() => { setEntries([]); setSelectedId(null); }} title="Wyczyść listę">
                Wyczyść
            </HeaderButton>
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="lineInspector"
            title={`Inspektor linii (${entries.length})`}
            minWidth={420}
            minHeight={260}
            initialWidth={900}
            initialHeight={600}
            className="line-insp-popup"
            bodyClassName="line-insp-popup-body"
            headerActions={headerActions}
        >
            <Input
                className="line-insp-search"
                placeholder="Szukaj w tekście lub nazwie triggera…"
                value={query}
                onChange={e => setQuery(e.target.value)}
            />
            <div className="line-insp-list" ref={listRef} onScroll={onScroll}>
                {visible.length === 0 ? (
                    <div className="popup-empty">
                        {entries.length === 0 ? 'Brak linii - nowe linie z gry pojawią się tutaj.' : 'Nic nie pasuje do filtra.'}
                    </div>
                ) : visible.map(entry => (
                    <Row
                        key={entry.id}
                        entry={entry}
                        showFinal={showFinal}
                        selected={entry.id === selectedId}
                        onSelect={setSelectedId}
                    />
                ))}
            </div>
            {selected && <Detail entry={selected} />}
        </DockablePopupWrapper>
    );
};

export default LineInspectorPopup;
