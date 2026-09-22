import { useMemo } from 'react';
import { BookOpen, ChevronLeft, Compass, Copy, Footprints, Library, Navigation, Swords, type LucideIcon } from 'lucide-react';
import eventBus from '@modules/core/eventBus';
import type { KnowledgeDetailsType } from '@modules/data/dataStores/knowledgeDetailsStore';
import { EntryRow, LevelBar, Segmented, StatusChip, Switch } from './knowledgeUi';
import {
    CATEGORY_SORTS,
    MAX_LEVEL,
    SOURCES,
    SOURCE_LABELS,
    filterEntries,
    sortCategories,
    type CategoryRow,
    type CategorySort,
    type EntryFilter,
} from './knowledgeModel';
import { areaOfRoom } from './useKnowledgeData';

const SOURCE_ICONS: Record<KnowledgeDetailsType, LucideIcon> = {
    fight: Swords,
    books: BookOpen,
    exploration: Footprints,
};

export interface CategoriesTabProps {
    rows: CategoryRow[];
    selected: string;
    onSelect: (name: string) => void;
    sort: CategorySort;
    onSort: (sort: CategorySort) => void;
    entryFilter: EntryFilter;
    onEntryFilter: (filter: EntryFilter) => void;
    hints: boolean;
    onHints: (on: boolean) => void;
    distance: (roomId: number | null | undefined) => number | null;
    /** A phone: the list and a category are two pages. */
    narrow: boolean;
    /** On a phone, whether the category page is showing. */
    pageOpen: boolean;
    onBack: () => void;
}

export function CategoriesTab(props: CategoriesTabProps) {
    const { rows, selected, sort, narrow, pageOpen } = props;
    const sorted = useMemo(() => sortCategories(rows, sort), [rows, sort]);
    const current = rows.find((row) => row.name === selected) ?? sorted[0];

    if (narrow) {
        return pageOpen && current ? (
            <div className="kn-cat-page">
                <button type="button" id="knowledge-back" className="kn-back" onClick={props.onBack}>
                    <ChevronLeft size={18} />
                    Kategorie
                </button>
                <CategoryDetail {...props} row={current} />
            </div>
        ) : (
            <CategoryList {...props} sorted={sorted} current={undefined} />
        );
    }

    return (
        <div className="kn-cats">
            <CategoryList {...props} sorted={sorted} current={current} />
            {current && <CategoryDetail {...props} row={current} />}
        </div>
    );
}

function CategoryList({
    sorted,
    current,
    sort,
    onSort,
    onSelect,
}: CategoriesTabProps & { sorted: CategoryRow[]; current: CategoryRow | undefined }) {
    return (
        <nav className="kn-cat-list">
            <div className="kn-cat-list__head">
                <span className="kn-cap">{sorted.length} kategorii</span>
                <select
                    id="knowledge-category-sort"
                    className="kn-select"
                    value={sort}
                    title="Kolejność"
                    onChange={(e) => onSort(e.target.value as CategorySort)}
                >
                    {CATEGORY_SORTS.map((option) => (
                        <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                </select>
            </div>
            <div className="kn-cat-list__rows">
                {sorted.map((row) => (
                    <button
                        key={row.name}
                        type="button"
                        className={`kn-cat-row${row === current ? ' is-active' : ''}${row.levelIndex >= MAX_LEVEL ? ' is-full' : ''}`}
                        data-category={row.name}
                        onClick={() => onSelect(row.name)}
                    >
                        <span className="kn-cat-row__top">
                            <span className="kn-cat-row__name">{row.name}</span>
                            <span className="kn-cat-row__level">{row.level || '—'}</span>
                        </span>
                        <LevelBar value={Math.max(0, row.levelIndex)} />
                    </button>
                ))}
            </div>
        </nav>
    );
}

function CategoryDetail({
    row,
    entryFilter,
    onEntryFilter,
    hints,
    onHints,
    distance,
}: CategoriesTabProps & { row: CategoryRow }) {
    const missing = row.entries.filter((entry) => entry.status !== 'known').length;
    const known = row.entries.length - missing;
    const entries = filterEntries(row.entries, entryFilter, '', hints);
    const libsDone = row.libraries.filter((lib) => lib.status === 'completed').length;
    const booksDone = row.books.filter((book) => book.status === 'completed').length;
    const unknown = row.sources.exploration?.unknown ?? [];

    const copyMissing = () => {
        const text = row.entries.filter((entry) => entry.status !== 'known').map((entry) => entry.name).join('\n');
        if (text) void navigator.clipboard?.writeText(text);
    };

    return (
        <section className="kn-cat" data-category={row.name}>
            <div className="kn-cat__head">
                <div className="kn-cat__title">
                    <span className="kn-cat__name">{row.name}</span>
                    <span className="kn-dim">
                        {row.level ? (
                            <>
                                Wiedza <span className="kn-accent">{row.level}</span> · {Math.max(0, row.levelIndex)} z {MAX_LEVEL}
                            </>
                        ) : (
                            <>Poziom nieznany: wyślij <code>wiedza</code> w grze</>
                        )}
                        {row.ticks > 0 && <span className="kn-muted"> · +{row.ticks} od ostatniego poziomu</span>}
                    </span>
                </div>
                <LevelBar value={Math.max(0, row.levelIndex)} size="lg" />
            </div>

            <div className="kn-sources">
                {SOURCES.map((source) => {
                    const summary = row.sources[source];
                    const Icon = SOURCE_ICONS[source];
                    const level = summary?.levelIndex ?? -1;
                    return (
                        <div key={source} className="kn-source" data-source={source}>
                            <span className="kn-dim kn-source__label"><Icon size={14} />{SOURCE_LABELS[source]}</span>
                            <span className="kn-source__value">
                                {source === 'exploration' && row.total > 0
                                    ? `${row.known} z ${row.total} miejsc`
                                    : summary?.level ?? '—'}
                            </span>
                            <LevelBar value={Math.max(0, level)} max={summary?.levelMax || MAX_LEVEL} />
                        </div>
                    );
                })}
            </div>

            <div className="kn-sec">
                <div className="kn-sec__head">
                    <Library size={15} />
                    <span className="kn-sec__title">Gdzie czytać</span>
                </div>
                <div className="kn-places">
                    <div className="kn-card">
                        <div className="kn-card__head">
                            <span className="kn-cap">Biblioteki</span>
                            <span className="kn-muted">{libsDone} z {row.libraries.length}</span>
                        </div>
                        {row.libraries.length === 0 && <div className="kn-card__empty">Żadna znana biblioteka nie uczy tej wiedzy.</div>}
                        {row.libraries.map((lib) => {
                            const steps = lib.current ? null : distance(lib.roomId);
                            return (
                                <div key={lib.id} className={`kn-card__row${lib.current ? ' is-here' : ''}${lib.status === 'completed' ? ' is-done' : ''}`}>
                                    <span className="kn-card__name">
                                        {lib.name}
                                        {lib.current ? <span className="kn-muted"> · tu jesteś</span>
                                            : steps != null ? <span className="kn-muted"> · {steps} lok.</span> : null}
                                    </span>
                                    <StatusChip status={lib.status} kind="library" />
                                    {lib.current && lib.status !== 'completed' ? (
                                        <button
                                            type="button"
                                            className="kn-btn kn-btn--sm kn-btn--solid"
                                            onClick={() => eventBus.emit('sendCommand', { command: `zglebiaj wiedze o ${row.dative}` })}
                                        >
                                            Zgłębiaj
                                        </button>
                                    ) : lib.status !== 'completed' && lib.roomId != null ? (
                                        <button
                                            type="button"
                                            className="kn-icon-btn"
                                            title="Prowadź"
                                            onClick={() => eventBus.emit('leadTo', lib.roomId!)}
                                        >
                                            <Navigation size={14} />
                                        </button>
                                    ) : (
                                        <span className="kn-icon-btn kn-icon-btn--empty" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="kn-card">
                        <div className="kn-card__head">
                            <span className="kn-cap">Księgi</span>
                            <span className="kn-muted">{booksDone} z {row.books.length}</span>
                        </div>
                        {row.books.length === 0 && <div className="kn-card__empty">Brak znanych ksiąg o tej wiedzy.</div>}
                        {row.books.map((book) => (
                            <div key={book.name} className={`kn-card__row${book.status === 'completed' ? ' is-done' : ''}`}>
                                <span className="kn-card__name">{book.name}</span>
                                <button
                                    type="button"
                                    className="kn-chip-btn"
                                    title="Kliknij, aby oznaczyć jako przeczytaną lub nie"
                                    onClick={() => eventBus.emit('knowledgeBookReportAction', { type: 'toggleBook', bookKey: book.name, category: row.name })}
                                >
                                    <StatusChip status={book.status} kind="book" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="kn-sec">
                <div className="kn-sec__head">
                    <Compass size={15} />
                    <span className="kn-sec__title">Wpisy wiedzy</span>
                    <span className="kn-muted">z eksploracji · {row.known} z {row.total}</span>
                    <span className="kn-grow" />
                    <Segmented<EntryFilter>
                        value={entryFilter}
                        onChange={onEntryFilter}
                        options={[
                            { key: 'missing', label: <>Brakujące <span className="kn-count">{missing}</span></> },
                            { key: 'known', label: <>Poznane <span className="kn-count">{known}</span></> },
                            { key: 'all', label: 'Wszystkie' },
                        ]}
                    />
                    <Switch id="knowledge-hints" checked={hints} onChange={onHints}>Podpowiedzi</Switch>
                    <button type="button" className="kn-icon-btn kn-icon-btn--box" title="Kopiuj brakujące" onClick={copyMissing}>
                        <Copy size={14} />
                    </button>
                </div>
                {row.entries.length === 0 ? (
                    <div className="kn-empty">Ta wiedza nie ma wpisów z eksploracji.</div>
                ) : entries.length === 0 ? (
                    <div className="kn-empty">{entryFilter === 'missing' ? 'Wszystkie wpisy poznane.' : 'Nic tu nie ma.'}</div>
                ) : (
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
                )}
                {unknown.length > 0 && (
                    <div className="kn-unknown">
                        <span className="kn-cap">Nieznane wpisy ({unknown.length})</span>
                        <ul className="kn-entries">
                            {unknown.map((name) => (
                                <li key={name} className="kn-entry kn-entry--unknown"><span className="kn-entry__dot" /><span className="kn-entry__body"><span className="kn-entry__name">{name}</span></span></li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    );
}
