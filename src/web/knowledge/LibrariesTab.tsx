import { useState } from 'react';
import { Check, MoreHorizontal, Navigation, RotateCcw, CheckCheck } from 'lucide-react';
import eventBus from '@modules/core/eventBus';
import { showContextMenu } from '@web/contextMenu';
import {
    libraryProgressText,
    plural,
    sortLibraries,
    type LibrariesPayload,
    type Library,
    type LibrarySort,
} from './knowledgeModel';
import { areaOfRoom, currentArea } from './useKnowledgeData';

export interface LibrariesTabProps {
    report: LibrariesPayload | null;
    sort: LibrarySort;
    hideCompleted: boolean;
    distance: (roomId: number | null | undefined) => number | null;
    /** A category chip opens it in Kategorie. */
    onOpenCategory: (name: string) => void;
}

function libraryMenu(lib: Library, x: number, y: number) {
    showContextMenu(
        [
            {
                label: 'Oznacz wszystko jako ukończone',
                icon: CheckCheck,
                action: () => eventBus.emit('knowledgeReportAction', { type: 'completeLibrary', libraryId: lib.id }),
            },
            {
                label: 'Zacznij od nowa',
                icon: RotateCcw,
                tone: 'danger',
                action: () => eventBus.emit('knowledgeReportAction', { type: 'resetLibrary', libraryId: lib.id }),
            },
        ],
        x,
        y,
        { header: lib.name, smallHeader: true },
    );
}

/** Where to go and read: libraries by what is left in them, the one you are in first. */
export function LibrariesTab({ report, sort, hideCompleted, distance, onOpenCategory }: LibrariesTabProps) {
    const [showDone, setShowDone] = useState(false);
    if (!report || report.libraries.length === 0) {
        return <div className="kn-empty">Brak danych o bibliotekach.</div>;
    }
    const here = report.libraries.find((lib) => lib.id === report.currentLibraryId);
    const others = sortLibraries(report.libraries.filter((lib) => lib !== here), sort, (lib) => distance(lib.roomId));
    const done = others.filter((lib) => lib.remaining === 0);
    const open = others.filter((lib) => lib.remaining > 0);
    const shown = hideCompleted && !showDone ? open : [...open, ...done];
    const area = currentArea();

    const row = (lib: Library) => {
        const isHere = lib === here;
        const libArea = areaOfRoom(lib.roomId);
        const steps = isHere ? null : distance(lib.roomId);
        const pending = lib.categories.filter((c) => c.status !== 'completed');
        const meta = [
            libArea,
            isHere ? `${lib.total} ${plural(lib.total, 'kategoria', 'kategorie', 'kategorii')}` : steps != null ? `${steps} lok.` : libArea && area && libArea !== area ? 'inny obszar' : '',
        ].filter(Boolean).join(' · ');
        return (
            <div
                key={lib.id}
                className={`kn-lib${isHere ? ' is-here' : ''}${lib.remaining === 0 ? ' is-done' : ''}`}
                data-library={lib.id}
                onContextMenu={(e) => {
                    e.preventDefault();
                    libraryMenu(lib, e.clientX, e.clientY);
                }}
            >
                <div className="kn-lib__name">
                    <span className="kn-lib__title">
                        {lib.name}
                        {isHere && <span className="kn-chip kn-chip--acc">tu jesteś</span>}
                    </span>
                    {meta && <span className="kn-muted">{meta}</span>}
                </div>
                <div className="kn-lib__cats">
                    {pending.length === 0 ? (
                        <span className="kn-chip kn-chip--ok"><Check size={12} strokeWidth={2.4} />wszystko zgłębione</span>
                    ) : (
                        pending.map((cat) => (
                            <button
                                key={cat.name}
                                type="button"
                                className={`kn-chip kn-chip--btn${cat.status === 'in_progress' ? ' kn-chip--warn' : ''}`}
                                title="Otwórz w Kategoriach"
                                onClick={() => onOpenCategory(cat.name)}
                            >
                                {cat.name}
                            </button>
                        ))
                    )}
                </div>
                <div className="kn-lib__progress">
                    <span className="kn-stack">
                        <span className="kn-stack__done" style={{ width: `${(lib.completed / lib.total) * 100}%` }} />
                        <span className="kn-stack__doing" style={{ width: `${(lib.in_progress / lib.total) * 100}%` }} />
                    </span>
                    <span className="kn-muted">{libraryProgressText(lib)}</span>
                </div>
                <div className="kn-lib__actions">
                    {!isHere && lib.remaining > 0 && lib.roomId != null && (
                        <button type="button" className="kn-btn kn-btn--sm" onClick={() => eventBus.emit('leadTo', lib.roomId!)}>
                            <Navigation size={13} />
                            Prowadź
                        </button>
                    )}
                    <button
                        type="button"
                        className="kn-icon-btn"
                        title="Więcej"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            libraryMenu(lib, rect.left, rect.bottom + 4);
                        }}
                    >
                        <MoreHorizontal size={15} />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="kn-libs">
            {here && row(here)}
            {shown.map(row)}
            {hideCompleted && done.length > 0 && (
                <div className="kn-libs__done">
                    <Check size={14} />
                    <span>
                        {done.length} {plural(done.length, 'biblioteka ukończona', 'biblioteki ukończone', 'bibliotek ukończonych')} w całości
                    </span>
                    <span className="kn-grow" />
                    <button type="button" className="kn-btn kn-btn--sm kn-btn--ghost" onClick={() => setShowDone((v) => !v)}>
                        {showDone ? 'Ukryj' : 'Pokaż'}
                    </button>
                </div>
            )}
            <div className="kn-legend">
                <span><span className="kn-chip kn-chip--warn">nazwa</span> w trakcie tutaj</span>
                <span><span className="kn-chip">nazwa</span> jeszcze nie czytane tutaj</span>
                <span className="kn-muted">Klik w kategorię otwiera ją w zakładce Kategorie.</span>
            </div>
        </div>
    );
}
