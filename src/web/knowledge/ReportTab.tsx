import { useRef } from 'react';
import { Check } from 'lucide-react';
import { EntryRow } from './knowledgeUi';
import {
    SOURCES,
    SOURCE_SHORT,
    filterEntries,
    fold,
    type CategoryRow,
    type EntryFilter,
} from './knowledgeModel';
import { areaOfRoom } from './useKnowledgeData';

export interface ReportTabProps {
    rows: CategoryRow[];
    query: string;
    filter: EntryFilter;
    hints: boolean;
    distance: (roomId: number | null | undefined) => number | null;
}

/** "dobra · walka niezła · książki dobra · eksploracja dobra" */
function levelsLine(row: CategoryRow): string {
    const parts = [row.level || '—'];
    for (const source of SOURCES) {
        const level = row.sources[source]?.level;
        if (level) parts.push(`${SOURCE_SHORT[source]} ${level}`);
    }
    return parts.join(' · ');
}

/**
 * Every category's entries in one column: what is still missing, and with
 * hints where to find it. Searching looks in the entries and the hints.
 */
export function ReportTab({ rows, query, filter, hints, distance }: ReportTabProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const searching = fold(query.trim()) !== '';

    const withEntries = rows.filter((row) => row.total > 0);
    const known = withEntries.reduce((sum, row) => sum + row.known, 0);
    const total = withEntries.reduce((sum, row) => sum + row.total, 0);
    const complete = withEntries.filter((row) => row.known >= row.total);
    const sections = withEntries
        .map((row) => ({ row, entries: filterEntries(row.entries, filter, query, hints) }))
        .filter(({ row, entries }) => entries.length > 0 && (filter !== 'missing' || row.known < row.total));

    const jumpTo = (name: string) => {
        const section = listRef.current?.querySelector<HTMLElement>(`[data-category="${CSS.escape(name)}"]`);
        section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };

    return (
        <div className="kn-report">
            <div className="kn-report__summary">
                <span className="kn-mono">{known} <span className="kn-muted">/ {total} wpisów</span></span>
                {withEntries
                    .filter((row) => row.known < row.total)
                    .map((row) => (
                        <button key={row.name} type="button" className="kn-chip kn-chip--btn" onClick={() => jumpTo(row.name)}>
                            {row.name} <span className="kn-chip__n">{row.total - row.known}</span>
                        </button>
                    ))}
            </div>
            <div className="kn-report__list" ref={listRef}>
                {total === 0 && <div className="kn-empty">Brak wpisów. Zbuduj raport: Odbuduj raport.</div>}
                {total > 0 && sections.length === 0 && (
                    <div className="kn-empty">{searching ? `Nic nie pasuje do „${query.trim()}”.` : 'Wszystkie wpisy poznane.'}</div>
                )}
                {sections.map(({ row, entries }) => {
                    const missing = row.total - row.known;
                    return (
                        <section key={row.name} className="kn-report-sec" data-category={row.name}>
                            <div className="kn-report-sec__head">
                                <span className="kn-report-sec__name">{row.name}</span>
                                <span className="kn-mono">{row.known} <span className="kn-muted">/ {row.total}</span></span>
                                <span className="kn-progress"><span style={{ width: `${(row.known / row.total) * 100}%` }} /></span>
                                {missing > 0 && <span className="kn-chip kn-chip--warn">{missing} brakuje</span>}
                                <span className="kn-grow" />
                                <span className="kn-muted kn-report-sec__levels">{levelsLine(row)}</span>
                            </div>
                            <ul className="kn-entries">
                                {entries.map((entry) => (
                                    <EntryRow
                                        key={entry.name}
                                        entry={entry}
                                        hints={hints}
                                        distance={hints && entry.status !== 'known' ? distance(entry.id) : null}
                                        area={hints ? areaOfRoom(entry.id) : undefined}
                                    />
                                ))}
                            </ul>
                        </section>
                    );
                })}
                {complete.length > 0 && !searching && (
                    <div className="kn-report__complete">
                        <Check size={14} />
                        <span>Komplet: {complete.map((row) => `${row.name} ${row.known}/${row.total}`).join(' · ')}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
