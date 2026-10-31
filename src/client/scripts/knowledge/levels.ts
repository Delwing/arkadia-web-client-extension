/**
 * Overall category levels: ticks ("twoja wiedza ... wzrosla") are logged, and the
 * `wiedza` command's list gets a bar per category with the ticks since its level
 * last changed. The levels it reports are stored for the details window.
 */
import {createColorFormat} from '@modules/core/Colors';
import {
    addKnowledgeEvent,
    getKnowledgeEventsForCharacter,
    parseDativeCategory,
    type KnowledgeEvent,
} from '@modules/data/dataStores/knowledgeEventsStore';
import type {AnsiAwareBuffer} from '@client/ansi/FormatState.ts';
import {
    getBaseCategoryFromName,
    getDativeCategoryName,
    KNOWLEDGE_CATEGORY_CONFIG,
    KnowledgeCategoryBaseName,
} from '../../knowledgeCategories';
import type {KnowledgeContext} from './context';
import type {KnowledgeEntries} from './entries';
import {
    getKnowledgeLevelIndex,
    KNOWLEDGE_TICK_PATTERN,
    sanitizeKnowledgeLevel,
    WIEDZA_TOTAL_LEVEL_PATTERN,
} from './parsing';
import {applyTotalLevels} from './progress';

const WIEDZA_TOTAL_INACTIVITY_TIMEOUT = 1500;
const WIEDZA_TOTAL_HARD_TIMEOUT = 10000;
const WIEDZA_TOTAL_TAG_PREFIX = 'wiedza-total-';

const LEVEL_COLORS: Record<number, string> = {
    0: '#808080', // brak - gray
    1: '#ef4444', // znikoma - red
    2: '#ef4444', // niewielka - red
    3: '#f59e0b', // czesciowa - amber
    4: '#f59e0b', // niezla - amber
    5: '#eab308', // dosc dobra - yellow
    6: '#eab308', // dobra - yellow
    7: '#22c55e', // bardzo dobra - green
    8: '#22c55e', // doskonala - green
    9: '#16a34a', // prawie pelna - dark green
    10: '#4ade80', // pelna - bright green
};
const TICK_COLOR = createColorFormat('#fbbf24');
const BAR_DIM_COLOR = createColorFormat('#4a5568');
const BAR_TEXT_COLOR = createColorFormat('#94a3b8');
const BAR_LEN = 10;
/** The longest level, "prawie pelna": the bars line up after it. */
const MAX_LEVEL_LEN = 12;

type WiedzaTotalRun = {
    tag: string;
    commandTimestamp: number;
    inactivityTimer: number | null;
    abortTimer: number;
    results: Map<KnowledgeCategoryBaseName, string>;
    /** Ticks since each category's last level change. */
    tickCounts: Map<KnowledgeCategoryBaseName, number>;
    lastLevels: Map<string, string>;
};

/** The newest level_change per category (by timestamp: imports are merged out of order). */
function latestLevelChanges(events: KnowledgeEvent[]): Map<string, {level: string; timestamp: number}> {
    const latest = new Map<string, {level: string; timestamp: number}>();
    for (const e of events) {
        if (e.type !== 'level_change' || !e.level) continue;
        const prev = latest.get(e.category);
        if (!prev || e.timestamp > prev.timestamp) {
            latest.set(e.category, {level: e.level, timestamp: e.timestamp});
        }
    }
    return latest;
}

/** Suffixes a bar like `[====      ] 40% + 3 ticks` onto a line of the `wiedza` list. */
function appendLevelBar(line: AnsiAwareBuffer, levelText: string, levelIndex: number, ticks: () => number) {
    const barColor = createColorFormat(LEVEL_COLORS[levelIndex] ?? '#808080');
    const filled = levelIndex > 0 ? '='.repeat(levelIndex) : '';
    const empty = ' '.repeat(BAR_LEN - Math.max(0, levelIndex));
    const percent = levelIndex >= 0 ? Math.round((levelIndex / BAR_LEN) * 100) : 0;

    const levelPad = ' '.repeat(Math.max(0, MAX_LEVEL_LEN - levelText.length));
    line.insert(line.text.length, levelPad + ' [', BAR_DIM_COLOR);
    if (filled) {
        line.insert(line.text.length, filled, barColor);
    }
    if (empty) {
        line.insert(line.text.length, empty, BAR_DIM_COLOR);
    }
    line.insert(line.text.length, ']', BAR_DIM_COLOR);

    if (percent < 100) {
        line.insert(line.text.length, ` ${percent}%`, BAR_TEXT_COLOR);
        const count = ticks();
        line.insert(line.text.length, ` + ${count}`, count > 0 ? TICK_COLOR : BAR_TEXT_COLOR);
        line.insert(line.text.length, ' ticks', BAR_TEXT_COLOR);
    } else {
        line.insert(line.text.length, ' 100%', barColor);
    }
}

export function initKnowledgeLevels(ctx: KnowledgeContext, entries: KnowledgeEntries): void {
    const {client, detailsStore} = ctx;
    let activeRun: WiedzaTotalRun | null = null;

    function finishRun() {
        if (!activeRun) {
            return;
        }
        const run = activeRun;
        activeRun = null;

        window.clearTimeout(run.abortTimer);
        if (run.inactivityTimer != null) {
            window.clearTimeout(run.inactivityTimer);
        }
        client.Triggers.removeByTag(run.tag);

        if (run.results.size === 0 || !ctx.details) {
            return;
        }

        const timestamp = Date.now();
        const characterKey = ctx.characterKey();

        // A level_change is stored only when the level moved. It is dated when the command
        // was sent, so ticks that came in while the list was printing still count before it.
        const levelEventsSaved = getKnowledgeEventsForCharacter(characterKey).then(async (events) => {
            const latestLevel = latestLevelChanges(events);
            for (const [category, level] of run.results) {
                if (latestLevel.get(category)?.level === level) continue;
                await addKnowledgeEvent(characterKey, {
                    category,
                    categoryDative: getDativeCategoryName(category),
                    type: 'level_change',
                    locationId: 0,
                    timestamp: run.commandTimestamp,
                    level,
                });
            }
        }).catch((error) => {
            console.error('Failed to store wiedza level changes:', error);
        });

        void detailsStore
            .applyLocalChange((snapshot) => applyTotalLevels(snapshot ?? ctx.details!, characterKey, run.results, timestamp))
            // The report makes the knowledge window re-read history, so the new levels must be in it
            .then(() => levelEventsSaved)
            .then(() => entries.scheduleReportUpdate())
            .catch((error) => {
                console.error('Failed to store wiedza_total levels:', error);
            });
    }

    function startRun() {
        if (activeRun) {
            finishRun();
        }

        const tag = `${WIEDZA_TOTAL_TAG_PREFIX}${Date.now().toString(36)}`;
        const run: WiedzaTotalRun = {
            tag,
            commandTimestamp: Date.now(),
            inactivityTimer: null,
            abortTimer: window.setTimeout(() => finishRun(), WIEDZA_TOTAL_HARD_TIMEOUT),
            results: new Map(),
            tickCounts: new Map(),
            lastLevels: new Map(),
        };
        activeRun = run;
        const isActive = () => activeRun === run;

        // Pre-load tick counts so they're available synchronously in the trigger
        void getKnowledgeEventsForCharacter(ctx.characterKey()).then((events) => {
            if (!isActive()) return;

            const lastLevelChanges = latestLevelChanges(events);
            for (const [cat, {level}] of lastLevelChanges) {
                run.lastLevels.set(cat, level);
            }
            for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
                const cat = config.base;
                const sinceTs = lastLevelChanges.get(cat)?.timestamp ?? 0;
                let count = 0;
                for (const e of events) {
                    if (e.type === 'tick' && e.category === cat && e.timestamp > sinceTs) {
                        count++;
                    }
                }
                if (count > 0) {
                    run.tickCounts.set(cat, count);
                }
            }
        });

        function scheduleInactivity() {
            if (!isActive()) {
                return;
            }
            if (run.inactivityTimer != null) {
                window.clearTimeout(run.inactivityTimer);
            }
            run.inactivityTimer = window.setTimeout(() => finishRun(), WIEDZA_TOTAL_INACTIVITY_TIMEOUT);
        }

        scheduleInactivity();

        client.Triggers.registerTrigger(
            WIEDZA_TOTAL_LEVEL_PATTERN,
            (line, matches) => {
                if (!isActive()) {
                    return line;
                }
                const categoryName = matches[1]?.trim();
                const levelText = matches[2]?.trim();
                if (!categoryName || !levelText) {
                    return line;
                }
                const category = getBaseCategoryFromName(categoryName);
                const level = sanitizeKnowledgeLevel(levelText);
                if (!category || !level) {
                    return line;
                }

                scheduleInactivity();
                run.results.set(category, level);
                appendLevelBar(line, levelText, getKnowledgeLevelIndex(level), () => {
                    // A new level counts from zero: the stored ticks are the ones that led up to it
                    const levelChanged = run.lastLevels.get(category) !== level;
                    return levelChanged ? 0 : run.tickCounts.get(category) ?? 0;
                });
                return line;
            },
            tag,
        );
    }

    client.on('command', (command = '') => {
        if (command.trim() === 'wiedza') {
            startRun();
        }
    });

    // "Wydaje ci sie, ze twoja wiedza o X wzrosla ..."
    client.Triggers.registerTrigger(
        KNOWLEDGE_TICK_PATTERN,
        (line, matches) => {
            const dativeText = matches[1];
            const category = dativeText ? parseDativeCategory(dativeText) : null;
            if (dativeText && category) {
                const roomId = client.Map.currentRoom?.userData?.internal_id;
                void addKnowledgeEvent(ctx.characterKey(), {
                    category,
                    categoryDative: dativeText.trim(),
                    type: 'tick',
                    locationId: roomId ? parseInt(roomId, 10) : 0,
                    timestamp: client.now(),
                });
                client.sendEvent('knowledgeTickEvent', {
                    category,
                    dative: dativeText.trim(),
                });
            }
            line.replace([0, line.text.length], line.text, TICK_COLOR);
            return line;
        },
        'knowledge-progress',
    );

    client.on('wiedzaImportTotalLevels', (detail) => {
        const payload = detail as { character: string; levels: { categoryName: string; level: string }[] } | undefined;
        if (!payload || !ctx.details) return;

        const latestLevels = new Map<KnowledgeCategoryBaseName, string>();
        for (const entry of payload.levels) {
            const category = getBaseCategoryFromName(entry.categoryName);
            if (category) latestLevels.set(category, entry.level);
        }
        if (latestLevels.size === 0) return;

        const characterKey = payload.character || ctx.characterKey();
        void detailsStore
            .applyLocalChange((snapshot) => applyTotalLevels(snapshot ?? ctx.details!, characterKey, latestLevels, Date.now()))
            .catch((e) => console.error('Failed to import total levels:', e));
    });
}
