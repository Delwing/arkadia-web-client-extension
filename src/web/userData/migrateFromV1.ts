/**
 * One-time move of a device from sync v1 to v2. See docs/dev/SYNC_V2_PLAN.md,
 * section 10.2.
 *
 * 1. Local data is brought in line with the v1 cloud document, like a last v1
 *    sync but without conflicts (reconcileWithV1).
 * 2. v1 categories where this device holds real edits (never uploaded, or
 *    changed since its last v1 sync): their v2 types record the first capture
 *    as edits. Everything else is data from before sync and seeds with the
 *    lowest stamps, so other devices' versions win on first contact.
 *
 * The result is remembered per user, so it runs once; if it can't complete
 * (offline, passphrase missing) sync v2 waits and it runs again later.
 */

import { calculateChecksum } from '@modules/firebase/firebaseCrypto';
import { downloadCategories, markSyncV2Started } from '@modules/firebase/firebaseUnifiedSync';
import { getCategoryDefinition, SYNC_CATEGORIES, type SyncCategory } from '@modules/firebase/categoryRegistry';
import { loadFirebaseSettings } from '@modules/firebase/firebaseTypes';
import {
    collectCharacters,
    exportCategories,
    importCategories,
    mergePerCharacterEnvelopes,
} from '@web/options/exportUtils';

/** The v1 category each v2 type's data used to sync in. Types not listed never synced in v1. */
export const V1_CATEGORY_OF_TYPE: Readonly<Record<string, SyncCategory>> = {
    triggers: 'triggers',
    aliases: 'aliases',
    automationGroups: 'automationGroups',
    automationScripts: 'automationScripts',
    shortcuts: 'shortcuts',
    keymaps: 'binds',
    shellSettings: 'shellSettings',
    renderSettings: 'renderSettings',
    mapSettings: 'mapSettings',
    behaviorSettings: 'behaviorSettings',
    characterKeys: 'characterSettings',
    profession: 'characterSettings',
    deposits: 'deposits',
    containers: 'containers',
    improveCounts: 'improveCounts',
    improveCountsEnabled: 'improveCounts',
    peopleEdits: 'peopleEdits',
    deviceInterface: 'uiSettings',
    deviceButtons: 'buttons',
    radial: 'radial',
    knowledgeLibraries: 'knowledge',
    knowledgeBooks: 'knowledge',
    knowledgeDetails: 'knowledge',
    knowledgeTicks: 'knowledge',
    knowledgeLevels: 'knowledge',
    kills: 'killCounts',
    visitedRooms: 'visitedRooms',
    locationNotes: 'locationNotes',
    multibinds: 'multibinds',
};

const migrationKey = (userId: string) => `arkadia.syncV2.migration:${userId}`;

interface MigrationState {
    /** v2 types whose first capture records edits. */
    editTypes: string[];
    at: number;
}

export function loadMigration(userId: string): MigrationState | null {
    try {
        return JSON.parse(localStorage.getItem(migrationKey(userId)) ?? 'null') as MigrationState | null;
    } catch {
        return null;
    }
}

/**
 * Bring local data in line with the v1 cloud, the way a v1 sync would but
 * without ever raising a conflict. Per v1 category, with `base` the checksum
 * this device last synced:
 * - same as the cloud, or nothing in the cloud: nothing to do (local data only
 *   this device has counts as an edit);
 * - nothing local, no base (a fresh device), or local unchanged since the base:
 *   the cloud wins and is imported;
 * - only local changed since the base: local edits, kept;
 * - both changed: local edits are kept; append and per-character data also
 *   take in the cloud's (union / characters only the cloud has), and v2 then
 *   merges item by item with the other devices.
 * Returns the categories holding local edits.
 */
export async function reconcileWithV1(passphrase: string | null): Promise<Set<SyncCategory>> {
    const local = await exportCategories(SYNC_CATEGORIES, collectCharacters());
    const cloud = await downloadCategories(SYNC_CATEGORIES, passphrase ?? undefined);
    if (!cloud.success) throw new Error(Object.values(cloud.errors)[0] ?? 'Failed to read v1 sync data');
    const base = loadFirebaseSettings().categorySyncChecksums;

    const edits = new Set<SyncCategory>();
    const toImport: Partial<Record<SyncCategory, string>> = {};
    for (const category of SYNC_CATEGORIES) {
        const localData = local[category];
        const cloudData = cloud.data[category];
        const cloudChecksum = cloud.payloads[category]?.checksum;
        if (!cloudData || !cloudChecksum) {
            if (localData) edits.add(category);
            continue;
        }
        if (!localData) {
            toImport[category] = cloudData;
            continue;
        }
        const localChecksum = await calculateChecksum(localData);
        if (localChecksum === cloudChecksum) continue;
        const known = base[category];
        if (known === undefined || localChecksum === known) {
            toImport[category] = cloudData;
            continue;
        }
        edits.add(category);
        if (cloudChecksum === known) continue;
        const merge = getCategoryDefinition(category).merge;
        if (merge === 'append') toImport[category] = cloudData;
        if (merge === 'perCharacter') toImport[category] = mergePerCharacterEnvelopes(localData, cloudData);
    }

    if (Object.keys(toImport).length > 0) {
        const result = await importCategories(toImport);
        if (!result.success) throw new Error(Object.values(result.errors)[0] ?? 'Failed to apply v1 sync data');
    }
    return edits;
}

/**
 * Run the migration for this user if it hasn't run yet. Returns the v2 types
 * whose first capture records edits, or null when it can't run now.
 */
export async function migrateFromV1(userId: string, passphrase: string | null): Promise<Set<string> | null> {
    const done = loadMigration(userId);
    if (done) return new Set(done.editTypes);

    let edits: Set<SyncCategory>;
    try {
        edits = await reconcileWithV1(passphrase);
    } catch (error) {
        console.warn('[SyncV2] v1 migration postponed:', error);
        return null;
    }
    const editTypes = Object.entries(V1_CATEGORY_OF_TYPE)
        .filter(([, category]) => edits.has(category))
        .map(([type]) => type);
    const state: MigrationState = { editTypes, at: Date.now() };
    localStorage.setItem(migrationKey(userId), JSON.stringify(state));
    await markSyncV2Started().catch(error => console.warn('[SyncV2] Could not mark the v1 document:', error));
    return new Set(editTypes);
}
