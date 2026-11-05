// Import from the registry module directly (not the @modules/firebase index)
// so this web-side module doesn't pull in the sync engine and its side effects.
import { getCategoryDefinition, type BackupCategory } from '@modules/firebase/categoryRegistry';
import type { CategoryHandler } from './categoryHandler';
import { StorageChangeTracker } from './storageChanges';
import { exportCharacterScopedKey, exportGlobalKeys, importCharacterScopedKey, importGlobalKeys } from './storageKeys';
import { buttonsCategory, radialCategory } from './categories/buttons';
import { characterSettingsCategory } from './categories/characterSettings';
import { killCountsCategory } from './categories/killCounts';
import { knowledgeCategory } from './categories/knowledge';
import { locationNotesCategory } from './categories/locationNotes';
import { multibindsCategory } from './categories/multibinds';
import { recordingsCategory } from './categories/recordings';
import { uiSettingsCategory } from './categories/uiSettings';
import { visitedRoomsCategory } from './categories/visitedRooms';

/**
 * Hand-written handlers for the registry's `customSync` categories. Every
 * other category is exported and imported from the storage keys it declares.
 */
const CUSTOM_CATEGORIES: Partial<Record<BackupCategory, CategoryHandler>> = {
    uiSettings: uiSettingsCategory,
    characterSettings: characterSettingsCategory,
    multibinds: multibindsCategory,
    buttons: buttonsCategory,
    radial: radialCategory,
    visitedRooms: visitedRoomsCategory,
    locationNotes: locationNotesCategory,
    killCounts: killCountsCategory,
    knowledge: knowledgeCategory,
    recordings: recordingsCategory,
};

/** Export a single category as a JSON string; null when it holds no data. */
export async function exportCategory(
    category: BackupCategory,
    selectedCharacters: string[]
): Promise<string | null> {
    try {
        const def = getCategoryDefinition(category);
        if (!def) return null;

        if (!def.customSync) {
            if (def.globalKeys) return exportGlobalKeys(def.globalKeys);
            if (def.characterKey) return exportCharacterScopedKey(def.characterKey, selectedCharacters);
            return null;
        }

        const handler = CUSTOM_CATEGORIES[category];
        if (!handler) return null;
        const data = handler.export(selectedCharacters);
        return data instanceof Promise ? await data : data;
    } catch (err) {
        console.error(`Failed to export category ${category}`, err);
        return null;
    }
}

/** Import a single category from a JSON string. */
export async function importCategory(
    category: BackupCategory,
    jsonData: string,
    options?: { skipDeviceScoped?: boolean }
): Promise<{ success: boolean; error?: string }> {
    try {
        const data = JSON.parse(jsonData);
        const storage = new StorageChangeTracker();

        const def = getCategoryDefinition(category);
        if (!def) {
            return { success: false, error: `Unknown category: ${category}` };
        }

        if (!def.customSync) {
            if (def.globalKeys) {
                importGlobalKeys(def.globalKeys, data as Record<string, unknown>, storage);
            } else if (def.characterKey) {
                importCharacterScopedKey(def.characterKey, data as Record<string, unknown>, storage);
            }
        } else {
            const handler = CUSTOM_CATEGORIES[category];
            if (!handler) {
                return { success: false, error: `Unknown category: ${category}` };
            }
            const pending = handler.import(data, { storage, skipDeviceScoped: options?.skipDeviceScoped ?? false });
            if (pending instanceof Promise) await pending;
        }

        // Notify storage listeners so the UI picks up the imported values
        storage.notify();
        return { success: true };
    } catch (err) {
        console.error(`Failed to import category ${category}`, err);
        return { success: false, error: String(err) };
    }
}

/** Export several categories; categories without data are left out. */
export async function exportCategories<C extends BackupCategory>(
    categories: readonly C[],
    selectedCharacters: string[]
): Promise<Partial<Record<C, string>>> {
    const result: Partial<Record<C, string>> = {};

    await Promise.all(
        categories.map(async (category) => {
            const data = await exportCategory(category, selectedCharacters);
            if (data) {
                result[category] = data;
            }
        })
    );

    return result;
}

/** Import several categories, collecting each failure by category. */
export async function importCategories<C extends BackupCategory>(
    categoryData: Partial<Record<C, string>>,
    options?: { skipDeviceScoped?: boolean }
): Promise<{ success: boolean; errors: Partial<Record<C, string>> }> {
    const errors: Partial<Record<C, string>> = {};

    await Promise.all(
        (Object.entries(categoryData) as [C, string][]).map(async ([category, data]) => {
            if (!data) return;
            const result = await importCategory(category, data, options);
            if (!result.success && result.error) {
                errors[category] = result.error;
            }
        })
    );

    return { success: Object.keys(errors).length === 0, errors };
}
