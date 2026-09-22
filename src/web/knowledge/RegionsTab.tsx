import { useMemo } from 'react';
import { EntryRow } from './knowledgeUi';
import { buildAreaSections, type CategoryRow, type EntryFilter } from './knowledgeModel';
import { areaOfRoom, currentArea } from './useKnowledgeData';

export interface RegionsTabProps {
    rows: CategoryRow[];
    filter: EntryFilter;
    query: string;
    hints: boolean;
    area: string;
    onArea: (area: string) => void;
    distance: (roomId: number | null | undefined) => number | null;
    roomVersion: number;
}

/** Entries by where they are: what is left to see in this part of the world. */
export function RegionsTab({ rows, filter, query, hints, area, onArea, distance, roomVersion }: RegionsTabProps) {
    const sections = useMemo(
        () => buildAreaSections(rows, filter, query, hints, areaOfRoom, currentArea()),
        // roomVersion: the player's own area goes first, and it moves with them.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rows, filter, query, hints, roomVersion],
    );
    const shown = area ? sections.filter((s) => s.area === area) : sections;

    return (
        <div className="kn-regions">
            <div className="kn-regions__head">
                <select id="knowledge-area" className="kn-select" value={area} onChange={(e) => onArea(e.target.value)}>
                    <option value="">Wszystkie regiony</option>
                    {sections.map((s) => (
                        <option key={s.area} value={s.area}>{s.area} ({s.known}/{s.total})</option>
                    ))}
                </select>
            </div>
            {shown.length === 0 && <div className="kn-empty">Nic tu nie ma.</div>}
            {shown.map((s) => (
                <section key={s.area} className="kn-region" data-area={s.area}>
                    <div className="kn-region__head">
                        <span className="kn-region__name">{s.area}</span>
                        <span className="kn-mono">{s.known} <span className="kn-muted">/ {s.total}</span></span>
                        <span className="kn-progress"><span style={{ width: `${s.total ? (s.known / s.total) * 100 : 0}%` }} /></span>
                    </div>
                    <ul className="kn-entries">
                        {s.entries.map((entry) => (
                            <EntryRow
                                key={entry.name}
                                entry={entry}
                                hints={hints}
                                distance={hints && entry.status !== 'known' ? distance(entry.id) : null}
                                extra={
                                    <span className="kn-entry__cats">
                                        {entry.categories.map((cat) => <span key={cat} className="kn-chip kn-chip--sm">{cat}</span>)}
                                    </span>
                                }
                            />
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}
