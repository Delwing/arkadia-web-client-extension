import { getKnowledgeStore, type KnowledgeProgressByCharacter, type KnowledgeBookProgressByCharacter } from "@modules/data/dataStores/knowledgeStore";
import { getKnowledgeDetailsStore, type KnowledgeProgressByCharacter as KnowledgeDetailsProgressByCharacter, type KnowledgeCharacterMetadataMap } from "@modules/data/dataStores/knowledgeDetailsStore";
import { loadKnowledgeEvents, mergeKnowledgeEvents, type KnowledgeEventsByCharacter } from "@modules/data/dataStores/knowledgeEventsStore";
import type { CategoryHandler } from "../categoryHandler";

export interface ExportedKnowledgeData {
    libraryProgress: KnowledgeProgressByCharacter;
    bookProgress: KnowledgeBookProgressByCharacter;
    events: KnowledgeEventsByCharacter;
    detailsProgress: KnowledgeDetailsProgressByCharacter;
    detailsCharacters: KnowledgeCharacterMetadataMap;
}

/** The entries of a per-character map whose character is selected. */
function pickCharacters<T>(byCharacter: Record<string, T>, selected: ReadonlySet<string>): Record<string, T> {
    const result: Record<string, T> = {};
    for (const [char, value] of Object.entries(byCharacter)) {
        if (selected.has(char)) result[char] = value;
    }
    return result;
}

export async function exportKnowledgeData(selectedCharacters: string[]): Promise<ExportedKnowledgeData | undefined> {
    const selectedSet = new Set(selectedCharacters);

    const [knowledgeSnapshot, detailsSnapshot, allEvents] = await Promise.all([
        getKnowledgeStore().getSnapshot(),
        getKnowledgeDetailsStore().getSnapshot(),
        loadKnowledgeEvents(),
    ]);

    const libraryProgress: KnowledgeProgressByCharacter = knowledgeSnapshot
        ? pickCharacters(knowledgeSnapshot.data.progress, selectedSet) : {};
    const bookProgress: KnowledgeBookProgressByCharacter = knowledgeSnapshot
        ? pickCharacters(knowledgeSnapshot.data.bookProgress, selectedSet) : {};
    const detailsProgress: KnowledgeDetailsProgressByCharacter = detailsSnapshot
        ? pickCharacters(detailsSnapshot.data.progress, selectedSet) : {};
    const detailsCharacters: KnowledgeCharacterMetadataMap = detailsSnapshot
        ? pickCharacters(detailsSnapshot.data.characters, selectedSet) : {};
    const events: KnowledgeEventsByCharacter = pickCharacters(allEvents, selectedSet);

    const hasData = Object.keys(libraryProgress).length > 0 ||
        Object.keys(bookProgress).length > 0 ||
        Object.keys(events).length > 0 ||
        Object.keys(detailsProgress).length > 0;

    if (!hasData) return undefined;

    return { libraryProgress, bookProgress, events, detailsProgress, detailsCharacters };
}

export async function importKnowledgeData(data: ExportedKnowledgeData): Promise<void> {
    // Import library progress and book progress into the knowledge store
    if (Object.keys(data.libraryProgress).length > 0 || Object.keys(data.bookProgress).length > 0) {
        const store = getKnowledgeStore();
        await store.applyLocalChange((current) => {
            if (!current) return current!;
            const nextProgress = { ...current.data.progress };
            for (const [char, progress] of Object.entries(data.libraryProgress)) {
                nextProgress[char] = { ...(nextProgress[char] ?? {}), ...progress };
            }
            const nextBookProgress = { ...current.data.bookProgress };
            for (const [char, progress] of Object.entries(data.bookProgress)) {
                nextBookProgress[char] = { ...(nextBookProgress[char] ?? {}), ...progress };
            }
            return {
                ...current,
                data: { ...current.data, progress: nextProgress, bookProgress: nextBookProgress },
            };
        });
    }

    // Import knowledge events using merge (deduplication by timestamp)
    for (const [char, charData] of Object.entries(data.events)) {
        if (charData.events.length > 0) {
            await mergeKnowledgeEvents(char, charData.events);
        }
    }

    // Import details progress and characters (preserving definitions)
    if (Object.keys(data.detailsProgress).length > 0 || Object.keys(data.detailsCharacters).length > 0) {
        const detailsStore = getKnowledgeDetailsStore();
        await detailsStore.applyLocalChange((current) => {
            if (!current) return current!;
            const nextProgress = { ...current.data.progress };
            for (const [char, progress] of Object.entries(data.detailsProgress)) {
                const existing = nextProgress[char] ?? {};
                const merged = { ...existing };
                for (const [category, categoryProgress] of Object.entries(progress)) {
                    const existingCat = merged[category as keyof typeof merged];
                    if (!existingCat || categoryProgress.updatedAt > existingCat.updatedAt) {
                        merged[category as keyof typeof merged] = categoryProgress;
                    }
                }
                nextProgress[char] = merged;
            }
            const nextCharacters = { ...current.data.characters };
            for (const [char, metadata] of Object.entries(data.detailsCharacters)) {
                nextCharacters[char] = { ...nextCharacters[char], ...metadata };
            }
            return {
                ...current,
                data: { ...current.data, progress: nextProgress, characters: nextCharacters },
            };
        });
    }
}

export const knowledgeCategory: CategoryHandler = {
    async export(selectedCharacters) {
        const knowledgeData = await exportKnowledgeData(selectedCharacters);
        return knowledgeData ? JSON.stringify(knowledgeData) : null;
    },
    async import(data) {
        await importKnowledgeData(data as ExportedKnowledgeData);
    },
};
