/**
 * Libraries: which categories each one teaches and how far the character got in
 * each, the `zglebiaj wiedze` prompt, and the libraries window.
 */
import {colorString, createColorFormat} from '@modules/core/Colors';
import type {KnowledgeReportAction} from '@shared/events';
import type {
    KnowledgeCategoryStatus,
    KnowledgeLibraryEntry,
    KnowledgeSnapshot,
} from '@modules/data/dataStores/knowledgeStore';
import {AnsiAwareBuffer, FormatStateSnapshot} from '@client/ansi/FormatState.ts';
import {getBaseCategoryFromName, getDativeCategoryName} from '../../knowledgeCategories';
import type {KnowledgeContext} from './context';
import {COMPLETE_LIBRARY_PATTERN, KNOWLEDGE_PROMPT_PATTERN, START_LIBRARY_PATTERN} from './parsing';
import {updateLibraryProgress} from './progress';
import {
    buildKnowledgeReport,
    getUniqueLibraryCategories,
    KnowledgeReportPayload,
    normalizeCategory,
} from './reports';

const STATUS_COLORS: Record<KnowledgeCategoryStatus, FormatStateSnapshot> = {
    not_started: createColorFormat('#ffffff'),
    in_progress: createColorFormat('#ffff00'),
    completed: createColorFormat('#00ff00'),
};
const HEADER_COLOR = createColorFormat('#7cfc00');

export interface KnowledgeLibraries {
    /** A new snapshot came in: re-resolve the current library and resend the report. */
    onSnapshot(): void;
    /** `/zglebiaj`: the current library's categories, coloured by progress. */
    showCategories(): void;
    /** `/biblioteki`: opens the libraries window. */
    showReport(): void;
}

export function createKnowledgeLibraries(ctx: KnowledgeContext): KnowledgeLibraries {
    const {client, store} = ctx;
    let reportTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingPromptTrigger: {
        trigger: ReturnType<typeof client.Triggers.registerOneTimeTrigger>;
        timeoutId: number;
    } | null = null;

    /** Libraries are keyed by the map's internal ids; the window wants rooms. */
    const withRoomIds = (report: KnowledgeReportPayload): KnowledgeReportPayload => {
        for (const library of report.libraries) {
            library.roomId = client.Map.getRoomIdByInternalId(library.locationId);
        }
        return report;
    };

    function buildReport(characterKey: string): KnowledgeReportPayload | null {
        const snapshot = ctx.snapshot!;
        const characterProgress = snapshot.data.progress[characterKey] ?? {};
        const report = buildKnowledgeReport(Object.entries(snapshot.data.libraries), characterProgress);
        if (report) {
            report.currentLibraryId = ctx.currentLibraryId;
        }
        return report;
    }

    function hasLibraries(snapshot: KnowledgeSnapshot | undefined): snapshot is KnowledgeSnapshot {
        return !!snapshot && Object.keys(snapshot.data.libraries).length > 0;
    }

    function dispatchReport() {
        if (!hasLibraries(ctx.snapshot)) {
            client.sendEvent('knowledgeReport', null);
            return;
        }
        const report = buildReport(ctx.characterKey());
        client.sendEvent('knowledgeReport', report && withRoomIds(report));
    }

    function updateCurrentLibrary(room: any) {
        const internalId: string | undefined = room?.userData?.internal_id?.trim();
        ctx.currentLibraryId = internalId && ctx.snapshot?.data.libraries[internalId] ? internalId : null;
    }

    function setProgress(category: string, status: KnowledgeCategoryStatus) {
        const libraryId = ctx.currentLibraryId;
        const library = libraryId ? ctx.snapshot?.data.libraries[libraryId] : undefined;
        if (!libraryId || !library) {
            return;
        }
        const normalized = normalizeCategory(category, library);
        if (!normalized) {
            return;
        }
        const characterKey = ctx.characterKey();

        void store
            .applyLocalChange((snapshot) => updateLibraryProgress(snapshot, characterKey, libraryId, (progress) => {
                const previousStatus = progress[normalized];
                if (previousStatus === 'completed' && status !== 'completed') return false;
                if (previousStatus === status) return false;
                progress[normalized] = status;
                return true;
            }))
            .catch((error) => {
                console.error('Failed to update knowledge progress:', error);
            });
    }

    async function updateLibraryCategoriesStatus(
        libraryId: string,
        status: KnowledgeCategoryStatus,
    ): Promise<boolean> {
        const library = ctx.snapshot?.data.libraries[libraryId];
        if (!library) {
            return false;
        }
        const categories = getUniqueLibraryCategories(library);
        if (categories.length === 0) {
            return false;
        }
        const characterKey = ctx.characterKey();

        let updated = false;
        try {
            await store.applyLocalChange((snapshot) => updateLibraryProgress(snapshot, characterKey, libraryId, (progress) => {
                let changed = false;
                for (const category of categories) {
                    if (status === 'not_started') {
                        if (progress[category]) {
                            delete progress[category];
                            changed = true;
                        }
                    } else if (progress[category] !== status) {
                        progress[category] = status;
                        changed = true;
                    }
                }
                updated = changed;
                return changed;
            }));
        } catch (error) {
            console.error('Failed to update knowledge library status:', error);
            return false;
        }

        if (updated) {
            dispatchReport();
        }
        return updated;
    }

    function printLibraryCategories(
        library: KnowledgeLibraryEntry,
        libraryProgress: Record<string, KnowledgeCategoryStatus>,
    ) {
        const lines = getUniqueLibraryCategories(library).map((category) => {
            const status = libraryProgress[category] ?? 'not_started';
            const dativeCategory = getDativeCategoryName(category);
            const buffer = new AnsiAwareBuffer(' - ');
            const startPos = buffer.text.length;
            buffer.insert(startPos, category, STATUS_COLORS[status]);
            buffer.createLink([startPos, startPos + category.length], {
                onClick: () => {
                    client.sendCommand(`zglebiaj wiedze o ${dativeCategory}`);
                },
                title: `Kliknij aby zgłębić wiedzę o: ${dativeCategory}`,
            });
            buffer.suffix('\n');
            return buffer;
        });

        [colorString(library.name, HEADER_COLOR), ...lines].forEach((line) => {
            client.print(line);
        });
    }

    /** The current library and the character's progress in it, or why there is none. */
    function currentLibrary():
        | { library: KnowledgeLibraryEntry; libraryProgress: Record<string, KnowledgeCategoryStatus> }
        | string {
        if (!ctx.snapshot) {
            return 'Dane wiedzy nie sa jeszcze dostepne.';
        }
        const libraryId = ctx.currentLibraryId;
        if (!libraryId) {
            return 'Nie jestes w bibliotece.';
        }
        const library = ctx.snapshot.data.libraries[libraryId];
        if (!library) {
            return 'Brak danych o tej bibliotece.';
        }
        const characterProgress = ctx.snapshot.data.progress[ctx.characterKey()] ?? {};
        return {library, libraryProgress: characterProgress[libraryId] ?? {}};
    }

    /**
     * The game's prompt lists the library's categories: print them coloured, or say
     * so when they differ from the library's data.
     */
    function handleKnowledgePrompt(categoriesText: string) {
        const current = currentLibrary();
        if (typeof current === 'string') {
            client.println(current);
            return;
        }
        const {library} = current;

        const cleaned = categoriesText.trim().replace(/\?$/, '').replace(/\s+/g, ' ');
        const normalizedPrompt = cleaned.replace(/\s+czy o\s+/gi, ', o ');
        const rawCategories = normalizedPrompt
            .split(/, o /i)
            .map((entry) => entry.trim().replace(/^[Oo]\s+/, '').trim())
            .filter((entry) => entry.length > 0);

        const normalizedCategories: string[] = [];
        const seenNormalized = new Set<string>();
        const unrecognized: string[] = [];
        for (const rawCategory of rawCategories) {
            const normalized = normalizeCategory(rawCategory, library);
            if (!normalized) {
                unrecognized.push(rawCategory);
                continue;
            }
            const key = normalized.toLowerCase();
            if (seenNormalized.has(key)) {
                continue;
            }
            seenNormalized.add(key);
            normalizedCategories.push(normalized);
        }

        const uniqueLibraryCategories = getUniqueLibraryCategories(library);
        const expectedSet = new Set(uniqueLibraryCategories);
        const seenSet = new Set(normalizedCategories);
        const missing = uniqueLibraryCategories.filter((category) => !seenSet.has(category));
        const unexpected = normalizedCategories.filter((category) => !expectedSet.has(category));

        if (
            unrecognized.length > 0 ||
            missing.length > 0 ||
            unexpected.length > 0 ||
            normalizedCategories.length !== uniqueLibraryCategories.length
        ) {
            const messages: string[] = [];
            if (unrecognized.length > 0) {
                messages.push(`Nie rozpoznano kategorii: ${unrecognized.join(', ')}.`);
            }
            if (missing.length > 0) {
                messages.push(`Brakuje kategorii: ${missing.join(', ')}.`);
            }
            if (unexpected.length > 0) {
                messages.push(`Nieoczekiwane kategorie: ${unexpected.join(', ')}.`);
            }
            messages.push('Prosze zglosic to do developera.');
            client.println(messages.join('\n'));
            console.warn('Knowledge prompt mismatch', {
                categoriesText,
                rawCategories,
                unrecognized,
                missing,
                unexpected,
            });
            return;
        }

        printLibraryCategories(library, current.libraryProgress);
    }

    function clearPendingPrompt(removeTrigger: boolean) {
        if (!pendingPromptTrigger) {
            return;
        }
        window.clearTimeout(pendingPromptTrigger.timeoutId);
        if (removeTrigger) {
            client.Triggers.removeTrigger(pendingPromptTrigger.trigger);
        }
        pendingPromptTrigger = null;
    }

    client.on('enterLocation', (detail) => {
        const prevLibraryId = ctx.currentLibraryId;
        updateCurrentLibrary((detail as { room?: any })?.room);
        if (ctx.currentLibraryId !== prevLibraryId) {
            client.sendEvent('knowledgeReportCurrentLibrary', ctx.currentLibraryId);
        }
    });

    client.on('command', (command = '') => {
        if (command.trim() !== 'zglebiaj wiedze') {
            return;
        }

        clearPendingPrompt(true);
        const trigger = client.Triggers.registerOneTimeTrigger(
            KNOWLEDGE_PROMPT_PATTERN,
            (line, matches) => {
                clearPendingPrompt(false);
                const categoriesText = matches[1];
                if (categoriesText) {
                    handleKnowledgePrompt(categoriesText);
                }
                return line;
            },
            'knowledge-progress',
        );
        const timeoutId = window.setTimeout(() => {
            clearPendingPrompt(true);
        }, 5000);
        pendingPromptTrigger = {trigger, timeoutId};
    });

    client.Triggers.registerTrigger(
        START_LIBRARY_PATTERN,
        (line, matches) => {
            const category = matches[1];
            if (category) {
                setProgress(category, 'in_progress');
                window.setTimeout(() => dispatchReport(), 50);
            }
            return line;
        },
        'knowledge-progress',
    );

    client.Triggers.registerTrigger(
        COMPLETE_LIBRARY_PATTERN,
        (line, matches) => {
            const category = matches[1];
            if (category) {
                setProgress(category, 'completed');
                window.setTimeout(() => dispatchReport(), 50);
            }
            return line;
        },
        'knowledge-progress',
    );

    client.on('knowledgeReportAction', (detail) => {
        const action = detail as KnowledgeReportAction | undefined | null;
        if (!action) {
            return;
        }
        if (action.type === 'completeLibrary') {
            void updateLibraryCategoriesStatus(action.libraryId, 'completed');
        } else if (action.type === 'resetLibrary') {
            void updateLibraryCategoriesStatus(action.libraryId, 'not_started');
        }
    });

    // For windows that reopen after a reload
    client.on('requestKnowledgeReport', (detail) => {
        if (!hasLibraries(ctx.snapshot)) {
            return;
        }
        const overrideChar = (detail as { character?: string } | undefined)?.character;
        const report = buildReport(overrideChar || ctx.characterKey());
        if (report) {
            client.sendEvent('knowledgeReport', withRoomIds(report));
        }
    });

    client.on('wiedzaImportLibraries', (detail) => {
        const payload = detail as { character: string; libraries: { locationId: number; categoryDative: string }[] } | undefined;
        if (!payload || !ctx.snapshot) return;

        // Numeric room id -> room -> its internal id, which keys the libraries
        const resolvedKeys = new Map<number, string>();
        for (const lib of payload.libraries) {
            if (resolvedKeys.has(lib.locationId)) continue;
            const internalId = client.Map.getRoomById(lib.locationId)?.userData?.internal_id?.trim();
            if (internalId && ctx.snapshot.data.libraries[internalId]) {
                resolvedKeys.set(lib.locationId, internalId);
            }
        }
        if (resolvedKeys.size === 0) return;

        void store.applyLocalChange((snapshot) => {
            if (!snapshot) return snapshot;
            const characterKey = payload.character || ctx.characterKey();
            const nextProgress = {...snapshot.data.progress};
            const characterProgress = {...(nextProgress[characterKey] ?? {})};

            for (const lib of payload.libraries) {
                const libraryKey = resolvedKeys.get(lib.locationId);
                if (!libraryKey) continue;
                const library = snapshot.data.libraries[libraryKey];
                if (!library) continue;
                const category = getBaseCategoryFromName(lib.categoryDative);
                if (!category) continue;
                const normalized = normalizeCategory(category, library);
                if (!normalized) continue;
                characterProgress[libraryKey] = {...(characterProgress[libraryKey] ?? {}), [normalized]: 'completed'};
            }

            nextProgress[characterKey] = characterProgress;
            return {...snapshot, data: {...snapshot.data, progress: nextProgress}};
        }).catch((e) => console.error('Failed to import libraries:', e));
    });

    return {
        onSnapshot() {
            if (client.Map.currentRoom) {
                updateCurrentLibrary(client.Map.currentRoom);
            }
            if (reportTimer != null) {
                clearTimeout(reportTimer);
            }
            reportTimer = setTimeout(() => {
                reportTimer = undefined;
                dispatchReport();
            }, 50);
        },

        showCategories() {
            const current = currentLibrary();
            if (typeof current === 'string') {
                client.println(current);
                return;
            }
            printLibraryCategories(current.library, current.libraryProgress);
        },

        showReport() {
            if (!ctx.snapshot) {
                client.println('Dane wiedzy nie sa jeszcze dostepne.');
                return;
            }
            if (!hasLibraries(ctx.snapshot)) {
                client.println('Brak danych o bibliotekach.');
                client.sendEvent('knowledgeReport', null);
                return;
            }
            const report = buildReport(ctx.characterKey());
            if (!report) {
                client.println('Brak wiedzy do zglebiania w znanych bibliotekach.');
                client.sendEvent('knowledgeReport', null);
                return;
            }
            client.sendEvent('knowledgeReport', withRoomIds(report));
            client.sendEvent('knowledgeReport.popup.open');
        },
    };
}
