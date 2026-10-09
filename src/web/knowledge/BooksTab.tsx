import { useMemo, useState } from 'react';
import { BookOpen, Check, CheckCheck, MoreHorizontal, RotateCcw } from 'lucide-react';
import eventBus from '@modules/core/eventBus';
import { showContextMenu } from '@web/contextMenu';
import {
    buildBookRows,
    filterBooks,
    plural,
    sortBooks,
    type BookRow,
    type BookSort,
    type BooksPayload,
} from './knowledgeModel';

export interface BooksTabProps {
    books: BooksPayload | null;
    sort: BookSort;
    hideRead: boolean;
    query: string;
    /** "Otwórz w Kategoriach" from a book's menu. */
    onOpenCategory: (name: string) => void;
}

const toggle = (book: string, category: string) =>
    eventBus.emit('knowledgeBookReportAction', { type: 'toggleBook', bookKey: book, category });

/** Flips every category of the book that is not already where it should end up. */
const markAll = (book: BookRow, read: boolean) =>
    book.categories
        .filter((c) => (c.status === 'completed') !== read)
        .forEach((c) => toggle(book.name, c.name));

function bookMenu(book: BookRow, x: number, y: number, onOpenCategory: (name: string) => void) {
    showContextMenu(
        [
            { label: 'Oznacz jako przeczytaną', icon: CheckCheck, action: () => markAll(book, true) },
            { label: 'Oznacz jako nieprzeczytaną', icon: RotateCcw, action: () => markAll(book, false) },
            ...book.categories.map((c, i) => ({
                label: `Otwórz „${c.name}”`,
                icon: BookOpen,
                separator: i === 0,
                action: () => onOpenCategory(c.name),
            })),
        ],
        x,
        y,
        { header: book.name, smallHeader: true },
    );
}

/** Every known book: what it teaches and which of it is read. */
export function BooksTab({ books, sort, hideRead, query, onOpenCategory }: BooksTabProps) {
    const [showRead, setShowRead] = useState(false);
    const rows = useMemo(() => sortBooks(filterBooks(buildBookRows(books), query), sort), [books, query, sort]);
    if (!books || Object.keys(books.books).length === 0) {
        return <div className="kn-empty">Brak danych o księgach.</div>;
    }
    const read = rows.filter((book) => book.remaining === 0);
    const unread = rows.filter((book) => book.remaining > 0);
    const shown = hideRead && !showRead ? unread : [...unread, ...read];

    const row = (book: BookRow) => {
        const inProgress = book.categories.filter((c) => c.status === 'in_progress').length;
        const total = book.categories.length;
        return (
            <div
                key={book.name}
                className={`kn-lib kn-book${book.remaining === 0 ? ' is-done' : ''}`}
                data-book={book.name}
                onContextMenu={(e) => {
                    e.preventDefault();
                    bookMenu(book, e.clientX, e.clientY, onOpenCategory);
                }}
            >
                <div className="kn-lib__name">
                    <span className="kn-lib__title">{book.name}</span>
                    <span className="kn-muted">
                        {total} {plural(total, 'kategoria', 'kategorie', 'kategorii')}
                        {' · '}
                        {book.remaining === 0 ? 'przeczytana' : `${book.read} z ${total} przeczytane`}
                    </span>
                </div>
                <div className="kn-lib__cats">
                    {book.categories.map((c) => (
                        <button
                            key={c.name}
                            type="button"
                            className={`kn-chip kn-chip--btn${c.status === 'completed' ? ' kn-chip--ok' : c.status === 'in_progress' ? ' kn-chip--warn' : ''}`}
                            data-status={c.status}
                            title="Kliknij, aby oznaczyć jako przeczytaną lub nie"
                            onClick={() => toggle(book.name, c.name)}
                        >
                            {c.status === 'completed' && <Check size={12} strokeWidth={2.4} />}
                            {c.name}
                        </button>
                    ))}
                </div>
                <span className="kn-stack kn-lib__progress">
                    <span className="kn-stack__done" style={{ width: `${total ? (book.read / total) * 100 : 0}%` }} />
                    <span className="kn-stack__doing" style={{ width: `${total ? (inProgress / total) * 100 : 0}%` }} />
                </span>
                <div className="kn-lib__actions">
                    <button
                        type="button"
                        className="kn-icon-btn"
                        title="Więcej"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            bookMenu(book, rect.left, rect.bottom + 4, onOpenCategory);
                        }}
                    >
                        <MoreHorizontal size={14} />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="kn-libs">
            {shown.length === 0 && <div className="kn-empty">{query ? 'Nic tu nie ma.' : 'Wszystkie księgi przeczytane.'}</div>}
            {shown.map(row)}
            {hideRead && read.length > 0 && (
                <div className="kn-libs__done">
                    <Check size={14} />
                    <span>
                        {read.length} {plural(read.length, 'księga przeczytana', 'księgi przeczytane', 'ksiąg przeczytanych')} w całości
                    </span>
                    <span className="kn-grow" />
                    <button type="button" className="kn-btn kn-btn--sm kn-btn--ghost" onClick={() => setShowRead((v) => !v)}>
                        {showRead ? 'Ukryj' : 'Pokaż'}
                    </button>
                </div>
            )}
            <div className="kn-legend">
                <span><span className="kn-chip kn-chip--ok"><Check size={12} strokeWidth={2.4} />nazwa</span> przeczytana</span>
                <span><span className="kn-chip">nazwa</span> jeszcze nie</span>
                <span className="kn-muted">Klik w kategorię zmienia, czy jest przeczytana.</span>
            </div>
        </div>
    );
}
