/**
 * Books: names in the output coloured and linked by how much of them was read,
 * reading progress from the game's lines, and the books window.
 */
import {createColorFormat, mudletColorLine} from '@modules/core/Colors';
import type {KnowledgeBookEntry} from '@modules/data/dataStores/knowledgeStore';
import {getUiPort, type BookCategoryState} from '@client/ports';
import {buildBookContextMenuItems, getBookCategoryStates, getBookOverallStatus} from '@client/bookProgress.ts';
import {getBaseCategoryFromName} from '../../knowledgeCategories';
import type {KnowledgeContext} from './context';
import {recolorToken} from './highlight';
import {KNOWLEDGE_BOOK_COMPLETE_PATTERN, KNOWLEDGE_BOOK_START_PATTERN} from './parsing';
import {BookProgressStatus, findBookProgValue, resolveBookCategory, updateBookProgress} from './progress';

const BOOK_TRIGGER_TAG = 'book-triggers';
const BOOK_STATUS_COLORS = {
    in_progress: createColorFormat('#b8a960'),
    completed: createColorFormat('#7aab7a'),
};

type BookTriggerEntry = { bookKey: string; dopelniacz: string; biernik: string; categories: string[] };

export interface KnowledgeBooks {
    /** Re-registers the name triggers for the books of a new snapshot. */
    registerTriggers(books: Record<string, KnowledgeBookEntry> | undefined): void;
}

export function createKnowledgeBooks(ctx: KnowledgeContext): KnowledgeBooks {
    const {client, store} = ctx;

    function getBookStates(bookKey: string, categories: string[]): BookCategoryState[] {
        const bookProg = ctx.snapshot?.data.bookProgress?.[ctx.characterKey()]?.[bookKey];
        return getBookCategoryStates(bookProg, categories);
    }

    function setBookProgress(bookKey: string, category: string, status: BookProgressStatus | false) {
        const characterKey = ctx.characterKey();
        void store
            .applyLocalChange((snapshot) => updateBookProgress(snapshot, characterKey, bookKey, category, status))
            .catch((error) => {
                console.error('Failed to update book progress:', error);
            });
    }

    function dispatchReport(overrideCharacter?: string) {
        if (!ctx.snapshot) {
            client.sendEvent('knowledgeBookReport', null);
            return;
        }
        const characterKey = overrideCharacter || ctx.characterKey();
        client.sendEvent('knowledgeBookReport', {
            books: ctx.snapshot.data.books ?? {},
            bookProgress: ctx.snapshot.data.bookProgress?.[characterKey] ?? {},
        });
    }

    /** The game named a book and a category in it: record it if the book teaches that. */
    function recordBookLine(
        bookName: string | undefined,
        categoryDative: string | undefined,
        nameForm: 'biernik' | 'dopelniacz',
        status: BookProgressStatus,
    ) {
        if (!bookName || !categoryDative || !ctx.snapshot) {
            return;
        }
        const category = getBaseCategoryFromName(categoryDative);
        if (!category) {
            return;
        }
        const found = Object.entries(ctx.snapshot.data.books).find(([, book]) => book[nameForm] === bookName);
        if (!found) {
            if (status === 'in_progress') {
                client.println(mudletColorLine(`<tomato>Nieznana ksiazka "<sky_blue>${bookName}<tomato>" - zglos ja na Discordzie!`));
            }
            return;
        }
        const [bookKey, book] = found;
        const resolvedCategory = resolveBookCategory(book, category);
        if (resolvedCategory) {
            setBookProgress(bookKey, resolvedCategory, status);
            window.setTimeout(() => dispatchReport(), 50);
        }
    }

    // "Zaczynasz zglebiac X, probujac dowiedziec sie czegos wiecej o Y."
    client.Triggers.registerTrigger(
        KNOWLEDGE_BOOK_START_PATTERN,
        (line, matches) => {
            recordBookLine(matches[1]?.trim(), matches[2]?.trim(), 'biernik', 'in_progress');
            return line;
        },
        'knowledge-progress',
    );

    // "Masz wrazenie, ze z X nie dowiesz sie juz niczego wiecej o Y."
    client.Triggers.registerTrigger(
        KNOWLEDGE_BOOK_COMPLETE_PATTERN,
        (line, matches) => {
            recordBookLine(matches[1]?.trim(), matches[2]?.trim(), 'dopelniacz', true);
            return line;
        },
        'knowledge-progress',
    );

    client.on('requestKnowledgeBookReport', (detail) => {
        dispatchReport((detail as { character?: string } | undefined)?.character);
    });

    client.on('knowledgeBookReportAction', (detail) => {
        const action = detail as { type: string; bookKey: string; category: string } | undefined | null;
        if (!action || !getBaseCategoryFromName(action.category)) {
            return;
        }
        if (action.type === 'toggleBook') {
            // The category comes from the book's own list, so it is used as is
            const bookProg = ctx.snapshot?.data.bookProgress?.[ctx.characterKey()]?.[action.bookKey] ?? {};
            setBookProgress(action.bookKey, action.category, !findBookProgValue(bookProg, action.category));
            window.setTimeout(() => dispatchReport(), 50);
        }
    });

    client.on('wiedzaImportBooks', (detail) => {
        const payload = detail as { character: string; books: { bookName: string; categoryDative: string }[] } | undefined;
        if (!payload) return;

        void store.applyLocalChange((snapshot) => {
            if (!snapshot) return snapshot;
            const characterKey = payload.character || ctx.characterKey();
            const nextBookProgress = {...(snapshot.data.bookProgress ?? {})};
            const characterBookProgress = {...(nextBookProgress[characterKey] ?? {})};

            for (const book of payload.books) {
                const category = getBaseCategoryFromName(book.categoryDative);
                if (!category) continue;
                const bookEntry = snapshot.data.books?.[book.bookName];
                const resolvedCat = bookEntry ? resolveBookCategory(bookEntry, category) : null;
                if (!resolvedCat) continue;
                characterBookProgress[book.bookName] = {...(characterBookProgress[book.bookName] ?? {}), [resolvedCat]: true};
            }

            nextBookProgress[characterKey] = characterBookProgress;
            return {...snapshot, data: {...snapshot.data, bookProgress: nextBookProgress}};
        }).catch((e) => console.error('Failed to import books:', e));
    });

    return {
        registerTriggers(books) {
            client.Triggers.removeByTag(BOOK_TRIGGER_TAG);
            if (!books) {
                return;
            }

            const bookVariants = new Map<string, BookTriggerEntry>();
            for (const [key, book] of Object.entries(books)) {
                const categories = book.categories;
                if (!categories || categories.length === 0) {
                    continue;
                }
                const variants = [
                    book.mianownik, book.dopelniacz, book.biernik,
                    book.mnoga_mianownik, book.mnoga_dopelniacz, book.mnoga_biernik,
                ];
                for (const variant of variants) {
                    const trimmed = variant?.trim();
                    if (!trimmed) {
                        continue;
                    }
                    const variantKey = trimmed.toLowerCase();
                    const existing = bookVariants.get(variantKey);
                    if (existing) {
                        for (const cat of categories) {
                            if (!existing.categories.includes(cat)) {
                                existing.categories.push(cat);
                            }
                        }
                    } else {
                        bookVariants.set(variantKey, {
                            bookKey: key,
                            dopelniacz: book.dopelniacz,
                            biernik: book.biernik,
                            categories: [...categories],
                        });
                    }
                }
            }

            for (const [token, entry] of bookVariants.entries()) {
                // Read on each event: progress changes after the line was drawn.
                const states = () => getBookStates(entry.bookKey, entry.categories);
                client.Triggers.registerTokenTrigger(
                    token,
                    (line, matches) => {
                        const tokenText = matches[0];
                        if (!tokenText) {
                            return line;
                        }

                        const status = getBookOverallStatus(states());
                        if (status !== 'not_started') {
                            recolorToken(line, matches, BOOK_STATUS_COLORS[status]);
                        }

                        line.createLinksForText(tokenText, {
                            onMouseEnter: (ev) => getUiPort().showBookTooltip(states(), ev.pageX, ev.pageY),
                            onMouseLeave: () => getUiPort().hideBookTooltip(),
                            onContextMenu: (ev) => {
                                getUiPort().hideBookTooltip();
                                const items = buildBookContextMenuItems(states(), entry, (cmd) => client.sendCommand(cmd));
                                getUiPort().showContextMenu(items, ev.pageX, ev.pageY);
                            },
                        }, {caseInsensitive: true});

                        return line;
                    },
                    BOOK_TRIGGER_TAG,
                    {caseInsensitive: true},
                );
            }
        },
    };
}
