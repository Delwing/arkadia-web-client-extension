import type { SyncGroup, SyncState } from './deviceTypes';
import { DEVICE_STORAGE_KEYS } from './deviceTypes';
import { getDeviceInfo } from './deviceStorage';

// Legacy storage keys (for migration)
const LEGACY_SYNC_GROUP_KEY = 'arkadia.syncGroup';
const LEGACY_SYNC_VERSION_KEY = 'arkadia.syncVersion';

// ============================================================================
// Migration from Legacy Storage
// ============================================================================

/**
 * Migrate from legacy separate keys to unified SyncState
 * Called automatically on first read
 */
function migrateLegacyStorage(): SyncState | null {
    try {
        const legacyGroupRaw = localStorage.getItem(LEGACY_SYNC_GROUP_KEY);
        if (!legacyGroupRaw) return null;

        const legacyGroup = JSON.parse(legacyGroupRaw);
        if (!legacyGroup?.id || !legacyGroup?.name) return null;

        const state: SyncState = { group: legacyGroup as SyncGroup };

        // Save to new format
        localStorage.setItem(DEVICE_STORAGE_KEYS.SYNC_STATE, JSON.stringify(state));

        // Remove legacy keys
        localStorage.removeItem(LEGACY_SYNC_GROUP_KEY);
        localStorage.removeItem(LEGACY_SYNC_VERSION_KEY);

        console.log('[SyncGroup] Migrated legacy storage to new format');
        return state;
    } catch (err) {
        console.error('[SyncGroup] Failed to migrate legacy storage', err);
        return null;
    }
}

// ============================================================================
// Sync State (group membership in localStorage)
// ============================================================================

function getSyncState(): SyncState | null {
    try {
        const raw = localStorage.getItem(DEVICE_STORAGE_KEYS.SYNC_STATE);

        // Try migration if new format doesn't exist
        if (!raw) {
            return migrateLegacyStorage();
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.group || typeof parsed.group !== 'object') return null;
        if (!parsed.group.id || typeof parsed.group.id !== 'string') return null;
        if (!parsed.group.name || typeof parsed.group.name !== 'string') return null;
        if (!Array.isArray(parsed.group.devices)) return null;
        return { group: parsed.group as SyncGroup };
    } catch {
        return null;
    }
}

/**
 * Clear sync state from localStorage
 */
export function clearSyncState(): void {
    try {
        localStorage.removeItem(DEVICE_STORAGE_KEYS.SYNC_STATE);
    } catch (err) {
        console.error('Failed to clear sync state', err);
    }
}

/**
 * Get the current device's sync group
 */
export function getSyncGroup(): SyncGroup | null {
    return getSyncState()?.group ?? null;
}

/**
 * Save sync group membership
 */
export function setSyncGroup(group: SyncGroup): void {
    try {
        const state: SyncState = { group };
        localStorage.setItem(DEVICE_STORAGE_KEYS.SYNC_STATE, JSON.stringify(state));
    } catch (err) {
        console.error('Failed to save sync state', err);
    }
}

/**
 * Leave the current sync group
 */
export function leaveSyncGroup(): void {
    clearSyncState();
}

/**
 * Check if the current device is in a sync group
 */
export function isInSyncGroup(): boolean {
    return getSyncState() !== null;
}

/**
 * Create a new sync group with a random UUID
 */
export function createLocalSyncGroup(name: string): SyncGroup {
    const deviceInfo = getDeviceInfo();
    const now = new Date().toISOString();

    const group: SyncGroup = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Moje urzadzenia',
        devices: [deviceInfo.id],
        createdAt: now,
        updatedAt: now,
    };

    setSyncGroup(group);

    return group;
}
