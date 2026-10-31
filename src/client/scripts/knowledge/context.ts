import type Client from '../../Client';
import {characterStorage} from '@modules/core/storage';
import {
    DEFAULT_KNOWLEDGE_CHARACTER_KEY,
    getKnowledgeStore,
    KnowledgeSnapshot,
} from '@modules/data/dataStores/knowledgeStore';
import {
    getKnowledgeDetailsStore,
    KnowledgeCharacterGender,
    KnowledgeDetailsSnapshot,
} from '@modules/data/dataStores/knowledgeDetailsStore';

/**
 * What the knowledge script's parts share: the two stores, their latest snapshots,
 * and where the character is. `initKnowledge` keeps the snapshots current.
 */
export interface KnowledgeContext {
    readonly client: Client;
    /** Libraries, books and the character's progress in them. */
    readonly store: ReturnType<typeof getKnowledgeStore>;
    /** Every category's entries and which of them the character knows. */
    readonly detailsStore: ReturnType<typeof getKnowledgeDetailsStore>;
    snapshot: KnowledgeSnapshot | undefined;
    details: KnowledgeDetailsSnapshot | undefined;
    /** From `Char.Info`; entries the game words per gender are shown in it. */
    gender: KnowledgeCharacterGender | null;
    /** The library the character stands in, keyed by the map's internal id. */
    currentLibraryId: string | null;
    /** The key progress is stored under for the logged-in character. */
    characterKey(): string;
}

export function createKnowledgeContext(client: Client): KnowledgeContext {
    return {
        client,
        store: getKnowledgeStore(),
        detailsStore: getKnowledgeDetailsStore(),
        snapshot: undefined,
        details: undefined,
        gender: null,
        currentLibraryId: null,
        characterKey() {
            const trimmed = characterStorage.getCharacter()?.trim();
            return trimmed ? trimmed : DEFAULT_KNOWLEDGE_CHARACTER_KEY;
        },
    };
}
