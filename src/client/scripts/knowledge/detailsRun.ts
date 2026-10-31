/**
 * `/wiedza_buduj`: asks the game for every category's list of known entries, one
 * category at a time, and stores what it says. The replies are hidden from the
 * output; a toast follows the progress.
 */
import type {NotificationPayload} from '@shared/events/clientEvents';
import {
    buildNormalizedDefinitions,
    KNOWLEDGE_DETAILS_TYPES,
    KnowledgeDetailsSnapshot,
    KnowledgeDetailsType,
} from '@modules/data/dataStores/knowledgeDetailsStore';
import {
    getBaseCategoryFromName,
    KNOWLEDGE_CATEGORY_CONFIG,
    KNOWLEDGE_CATEGORY_ORDER,
    KnowledgeCategoryBaseName,
} from '../../knowledgeCategories';
import type {KnowledgeContext} from './context';
import type {KnowledgeEntries} from './entries';
import {
    detectKnowledgeDetailsType,
    KNOWLEDGE_ENTRY_PATTERN,
    KNOWLEDGE_HEADER_PATTERN,
    KNOWLEDGE_SECTION_HEADER_PATTERN,
    KNOWLEDGE_SUMMARY_PATTERN,
    normalizeKnowledgeEntry,
} from './parsing';

/** How long to wait for a category's reply, or the next page of one, to start. */
const KNOWLEDGE_REPORT_INACTIVITY_TIMEOUT = 1500;
/** A reply comes in one burst: once its lines stop for this long, it is over. */
const KNOWLEDGE_REPORT_REPLY_GAP = 500;
const KNOWLEDGE_REPORT_HARD_TIMEOUT = 15000;
const KNOWLEDGE_REPORT_TOAST = 'knowledge-report';

/** What one category's reply said. */
type CategoryRunState = {
    levels: Partial<Record<KnowledgeDetailsType, string>>;
    knownEntries: Record<KnowledgeDetailsType, Set<string>>;
    unknownEntries: Record<KnowledgeDetailsType, Set<string>>;
};

function createEntrySets(): Record<KnowledgeDetailsType, Set<string>> {
    return {fight: new Set(), books: new Set(), exploration: new Set()};
}

function sortedEntries(sets: Record<KnowledgeDetailsType, Set<string>>): Record<KnowledgeDetailsType, string[]> {
    const result = {} as Record<KnowledgeDetailsType, string[]>;
    for (const type of KNOWLEDGE_DETAILS_TYPES) {
        result[type] = Array.from(sets[type]).sort((a, b) => a.localeCompare(b));
    }
    return result;
}

/** The run's results replace the character's progress in the categories that answered. */
function applyRunResults(
    snapshot: KnowledgeDetailsSnapshot,
    ctx: KnowledgeContext,
    characterKey: string,
    results: Map<KnowledgeCategoryBaseName, CategoryRunState>,
    timestamp: number,
): KnowledgeDetailsSnapshot {
    const nextProgress = {...snapshot.data.progress};
    const characterProgress = {...(nextProgress[characterKey] ?? {})};
    const nextCharacters = {...(snapshot.data.characters ?? {})};
    const existingMetadata = nextCharacters[characterKey] ?? {};

    if (ctx.gender) {
        nextCharacters[characterKey] = {...existingMetadata, gender: ctx.gender, updatedAt: timestamp};
    } else if (Object.keys(existingMetadata).length > 0) {
        nextCharacters[characterKey] = {...existingMetadata, updatedAt: timestamp};
    }

    for (const [category, state] of results) {
        const levels: Partial<Record<KnowledgeDetailsType, string>> = {};
        for (const type of KNOWLEDGE_DETAILS_TYPES) {
            const level = state.levels[type];
            if (level) {
                levels[type] = level;
            }
        }
        characterProgress[category] = {
            entries: sortedEntries(state.knownEntries),
            unknownEntries: sortedEntries(state.unknownEntries),
            levels,
            updatedAt: timestamp,
        };
    }

    nextProgress[characterKey] = characterProgress;
    return {
        ...snapshot,
        data: {...snapshot.data, progress: nextProgress, characters: nextCharacters},
    };
}

export interface KnowledgeDetailsRun {
    build(): void;
}

export function createKnowledgeDetailsRun(ctx: KnowledgeContext, entries: KnowledgeEntries): KnowledgeDetailsRun {
    const {client, detailsStore} = ctx;
    let activeRun: { tag: string; abortTimer: number; inactivityTimer: number | null } | null = null;

    function build() {
        if (!ctx.details) {
            client.println('Dane wiedzy nie sa jeszcze dostepne.');
            return;
        }
        if (activeRun) {
            client.println('Raport wiedzy jest juz generowany.');
            return;
        }

        const runTag = `knowledge-details-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2)}`;
        const normalizedDefinitions = buildNormalizedDefinitions(ctx.details.data.definitions);
        const results = new Map<KnowledgeCategoryBaseName, CategoryRunState>();
        const categoriesRemaining = new Set<KnowledgeCategoryBaseName>(KNOWLEDGE_CATEGORY_ORDER);
        /**
         * One category at a time: a long reply is cut by the game's pager, and every command
         * already queued behind it lands in the pager instead of the game - it only reprints
         * "[linia 60/71 - ENTER by przejsc dalej ...]" and the category is never asked for.
         */
        const pendingCategories = [...KNOWLEDGE_CATEGORY_CONFIG];
        let currentCategory: KnowledgeCategoryBaseName | null = null;
        let currentSection: KnowledgeDetailsType | null = null;

        const run = {tag: runTag, abortTimer: 0, inactivityTimer: null as number | null};
        const isActive = () => activeRun === run;

        function ensureCategoryState(category: KnowledgeCategoryBaseName): CategoryRunState {
            let state = results.get(category);
            if (!state) {
                state = {levels: {}, knownEntries: createEntrySets(), unknownEntries: createEntrySets()};
                results.set(category, state);
            }
            return state;
        }

        function scheduleInactivity(delay = KNOWLEDGE_REPORT_INACTIVITY_TIMEOUT) {
            if (!isActive()) {
                return;
            }
            if (run.inactivityTimer != null) {
                window.clearTimeout(run.inactivityTimer);
            }
            run.inactivityTimer = window.setTimeout(sendNextCommand, delay);
        }

        /** The previous reply has gone quiet: ask for the next category, or wrap up. */
        function sendNextCommand() {
            if (!isActive()) {
                return;
            }
            const config = pendingCategories.shift();
            if (!config) {
                finishRun(false);
                return;
            }
            window.clearTimeout(run.abortTimer);
            run.abortTimer = window.setTimeout(() => finishRun(true), KNOWLEDGE_REPORT_HARD_TIMEOUT);
            scheduleInactivity();
            const asked = KNOWLEDGE_CATEGORY_CONFIG.length - pendingCategories.length;
            client.sendEvent('notify', {
                key: KNOWLEDGE_REPORT_TOAST,
                update: asked > 1,
                source: 'client',
                sticky: true,
                title: 'Budowanie raportu wiedzy',
                text: `${asked} z ${KNOWLEDGE_CATEGORY_CONFIG.length}: ${config.base}`,
                progress: {value: asked - 1, max: KNOWLEDGE_CATEGORY_CONFIG.length},
            });
            client.sendCommand(config.command, false);
        }

        // The pager's line is hidden before the run's triggers see it, but the automatic
        // ENTER it answers with comes by here: the next page is on its way, keep waiting.
        const stopWatchingPager = client.on('command', (command = '') => {
            if (command === '') {
                scheduleInactivity();
            }
        });

        /** Replaces the progress toast with how the run ended. */
        function endReportToast(payload: Omit<NotificationPayload, 'key' | 'source'>) {
            client.sendEvent('notify.dismiss', {key: KNOWLEDGE_REPORT_TOAST});
            client.sendEvent('notify', {key: KNOWLEDGE_REPORT_TOAST, source: 'client', ...payload});
        }

        function finishRun(dueToTimeout: boolean) {
            if (!isActive()) {
                return;
            }

            window.clearTimeout(run.abortTimer);
            if (run.inactivityTimer != null) {
                window.clearTimeout(run.inactivityTimer);
            }
            activeRun = null;
            entries.setHighlighting(true);
            stopWatchingPager();
            client.Triggers.removeByTag(runTag);

            if (results.size === 0) {
                endReportToast({
                    level: 'error',
                    text: dueToTimeout ? 'Nie odebrano odpowiedzi raportu wiedzy.' : 'Brak danych o wiedzy.',
                });
                return;
            }

            for (const [category, state] of results) {
                for (const type of KNOWLEDGE_DETAILS_TYPES) {
                    const unknownList = Array.from(state.unknownEntries[type]);
                    if (unknownList.length > 0) {
                        console.warn('Nieznane wpisy wiedzy', {category, type, entries: unknownList});
                    }
                }
            }

            const timestamp = Date.now();
            const characterKey = ctx.characterKey();
            void detailsStore
                .applyLocalChange((snapshot) => applyRunResults(snapshot ?? ctx.details!, ctx, characterKey, results, timestamp))
                .catch((error) => {
                    console.error('Failed to store knowledge details report:', error);
                });

            const problems: string[] = [];
            if (dueToTimeout) {
                problems.push('Przekroczono czas – zebrano dostępne dane.');
            }
            if (categoriesRemaining.size > 0) {
                problems.push(`Brak odpowiedzi dla: ${Array.from(categoriesRemaining).join(', ')}.`);
            }
            endReportToast({
                level: problems.length > 0 ? 'warning' : 'success',
                text: ['Zaktualizowano raport wiedzy.', ...problems].join(' '),
                actions: [{label: 'Pokaż', command: '/wiedza', primary: true}],
            });
        }

        entries.setHighlighting(false);
        activeRun = run;

        // The reply goes to the knowledge window, not the output: every line of it is
        // hidden while a toast follows the progress.
        client.Triggers.registerTrigger(
            /^s*$/,
            (line) => (currentCategory ? null : line),
            runTag,
        );

        client.Triggers.registerTrigger(
            KNOWLEDGE_HEADER_PATTERN,
            (_line, matches) => {
                scheduleInactivity(KNOWLEDGE_REPORT_REPLY_GAP);
                const base = getBaseCategoryFromName(matches[1]);
                currentCategory = base ?? null;
                currentSection = null;
                if (base) {
                    categoriesRemaining.delete(base);
                    ensureCategoryState(base);
                }
                return null;
            },
            runTag,
        );

        client.Triggers.registerTrigger(
            KNOWLEDGE_SUMMARY_PATTERN,
            (line, matches) => {
                if (!currentCategory) {
                    return line;
                }
                const type = detectKnowledgeDetailsType(matches[1]);
                if (!type) {
                    return null;
                }
                scheduleInactivity(KNOWLEDGE_REPORT_REPLY_GAP);
                ensureCategoryState(currentCategory).levels[type] = matches[2].trim();
                return null;
            },
            runTag,
        );

        client.Triggers.registerTrigger(
            KNOWLEDGE_SECTION_HEADER_PATTERN,
            (line, matches) => {
                if (!currentCategory) {
                    return line;
                }
                scheduleInactivity(KNOWLEDGE_REPORT_REPLY_GAP);
                currentSection = detectKnowledgeDetailsType(matches[1]) ?? null;
                return null;
            },
            runTag,
        );

        client.Triggers.registerTrigger(
            KNOWLEDGE_ENTRY_PATTERN,
            (line, matches) => {
                if (!currentCategory) {
                    return line;
                }
                if (!currentSection) {
                    return null;
                }
                const entry = matches[1].trim();
                if (entry.length === 0) {
                    return null;
                }

                scheduleInactivity(KNOWLEDGE_REPORT_REPLY_GAP);
                const normalized = normalizeKnowledgeEntry(entry);
                const state = ensureCategoryState(currentCategory);
                const definitionMap = normalizedDefinitions[currentCategory]?.[currentSection];
                if (definitionMap?.has(normalized)) {
                    state.knownEntries[currentSection].add(definitionMap.get(normalized) ?? entry);
                } else {
                    state.unknownEntries[currentSection].add(entry);
                }
                return null;
            },
            runTag,
        );

        sendNextCommand();
    }

    return {build};
}
