/**
 * One-time move of a device from sync v1 to v2. See docs/dev/SYNC_V2_PLAN.md,
 * section 10.2.
 *
 * 1. A last v1 sync pulls what other devices uploaded to the v1 document into
 *    local data (and pushes this device's changes where the cloud didn't
 *    move).
 * 2. v1 categories where this device still differs from the v1 cloud hold
 *    real edits (never uploaded, or in an unresolved conflict): their v2
 *    types record the first capture as edits. Everything else is data from
 *    before sync and seeds with the lowest stamps, so other devices' versions
 *    win on first contact.
 *
 * The result is remembered per user, so it runs once; if it can't complete
 * (offline, passphrase missing) sync v2 waits and it runs again later.
 */

import { calculateChecksum } from '@modules/firebase/firebaseCrypto';
import { downloadCategories, markSyncV2Started } from '@modules/firebase/firebaseUnifiedSync';
import { SYNC_CATEGORIES, type SyncCategory } from '@modules/firebase/categoryRegistry';
import { syncEngine } from '@modules/firebase/syncEngine';
import { collectCharacters, exportCategories } from '@web/options/exportUtils';

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
 * v1 categories where local data differs from the v1 cloud, or that were
 * never uploaded.
 */
export async function categoriesWithLocalEdits(passphrase: string | null): Promise<Set<SyncCategory>> {
    const local = await exportCategories(SYNC_CATEGORIES, collectCharacters());
    const cloud = await downloadCategories(SYNC_CATEGORIES, passphrase ?? undefined);
    if (!cloud.success) throw new Error(Object.values(cloud.errors)[0] ?? 'Failed to read v1 sync data');
    const changed = new Set<SyncCategory>();
    for (const category of SYNC_CATEGORIES) {
        const data = local[category];
        if (!data) continue;
        const payload = cloud.payloads[category];
        if (!payload || (await calculateChecksum(data)) !== payload.checksum) changed.add(category);
    }
    return changed;
}

/**
 * Run the migration for this user if it hasn't run yet. Returns the v2 types
 * whose first capture records edits, or null when it can't run now.
 */
export async function migrateFromV1(userId: string, passphrase: string | null): Promise<Set<string> | null> {
    const done = loadMigration(userId);
    if (done) return new Set(done.editTypes);

    const result = await syncEngine.syncNow(false);
    if (result.status === 'error' || (result.status === 'skipped' && result.reason === 'needs-passphrase')) {
        return null;
    }
    let changed: Set<SyncCategory>;
    try {
        changed = await categoriesWithLocalEdits(passphrase);
    } catch (error) {
        console.warn('[SyncV2] v1 migration postponed:', error);
        return null;
    }
    const editTypes = Object.entries(V1_CATEGORY_OF_TYPE)
        .filter(([, category]) => changed.has(category))
        .map(([type]) => type);
    const state: MigrationState = { editTypes, at: Date.now() };
    localStorage.setItem(migrationKey(userId), JSON.stringify(state));
    await markSyncV2Started().catch(error => console.warn('[SyncV2] Could not mark the v1 document:', error));
    return new Set(editTypes);
}
