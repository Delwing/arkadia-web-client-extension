import { useMemo, useState } from 'react';
import type { KnowledgeEvent } from '@modules/data/dataStores/knowledgeEventsStore';
import { levelIndex } from './knowledgeModel';
import { LevelBar } from './knowledgeUi';

function formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Knowledge ticks and level changes, newest first. */
export function HistoryTab({ events }: { events: KnowledgeEvent[] | null }) {
    const [category, setCategory] = useState('');
    const categories = useMemo(
        () => [...new Set((events ?? []).map((e) => e.category))].sort((a, b) => a.localeCompare(b)),
        [events],
    );
    const rows = useMemo(
        () => (events ?? [])
            .filter((e) => (e.type === 'tick' || e.type === 'level_change') && (!category || e.category === category))
            .sort((a, b) => b.timestamp - a.timestamp),
        [events, category],
    );

    if (events === null) return <div className="kn-empty">Ładowanie…</div>;
    if (events.length === 0) return <div className="kn-empty">Brak zdarzeń. Ticki i zmiany poziomu pojawią się tutaj.</div>;

    return (
        <div className="kn-history">
            <div className="kn-regions__head">
                <select id="knowledge-history-category" className="kn-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="">Wszystkie kategorie</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="kn-muted">{rows.length} zdarzeń</span>
            </div>
            <table className="kn-history__table">
                <thead>
                    <tr><th>Data</th><th>Kategoria</th><th>Co</th><th /></tr>
                </thead>
                <tbody>
                    {rows.map((e, i) => (
                        <tr key={`${e.timestamp}-${e.category}-${i}`} className={e.type === 'level_change' ? 'is-level' : undefined}>
                            <td className="kn-mono kn-muted">{formatDate(e.timestamp)}</td>
                            <td>{e.category}</td>
                            <td>
                                {e.type === 'level_change'
                                    ? <span className="kn-chip kn-chip--acc">poziom: {e.level}</span>
                                    : <span className="kn-chip">tick</span>}
                            </td>
                            <td>
                                {e.type === 'level_change'
                                    ? <LevelBar value={Math.max(0, levelIndex(e.level))} />
                                    : e.locationId ? <span className="kn-muted kn-mono">#{e.locationId}</span> : null}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
