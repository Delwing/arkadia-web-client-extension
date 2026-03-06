import type { SyncGroup, SyncedDeviceSettings, SyncState } from './deviceTypes';
import { DEVICE_STORAGE_KEYS } from './deviceTypes';
import { getDeviceInfo } from './deviceStorage';
import { ACTIVE_KEYMAP_STORAGE_KEY } from '@modules/core/keymapTypes';

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

        const legacyVersionRaw = localStorage.getItem(LEGACY_SYNC_VERSION_KEY);
        const legacyVersion = legacyVersionRaw ? parseInt(legacyVersionRaw, 10) : 1;

        const state: SyncState = {
            group: legacyGroup as SyncGroup,
            version: isNaN(legacyVersion) ? 1 : legacyVersion,
        };

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
// Sync State - Single Read/Write for All Sync Data
// ============================================================================

/**
 * Get the full sync state from localStorage (single read)
 */
export function getSyncState(): SyncState | null {
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
        if (typeof parsed.version !== 'number') return null;
        return parsed as SyncState;
    } catch {
        return null;
    }
}

/**
 * Save the full sync state to localStorage (single write)
 */
export function setSyncState(state: SyncState): void {
    try {
        localStorage.setItem(DEVICE_STORAGE_KEYS.SYNC_STATE, JSON.stringify(state));
    } catch (err) {
        console.error('Failed to save sync state', err);
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

// ============================================================================
// Convenience Functions (use cached state when possible)
// ============================================================================

/**
 * Get the current device's sync group
 */
export function getSyncGroup(): SyncGroup | null {
    return getSyncState()?.group ?? null;
}

/**
 * Save sync group (updates state with current version or initializes to 1)
 */
export function setSyncGroup(group: SyncGroup): void {
    const current = getSyncState();
    setSyncState({
        group,
        version: current?.version ?? 1,
    });
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
 * Get the current sync version number
 */
export function getSyncVersion(): number {
    return getSyncState()?.version ?? 0;
}

/**
 * Set the sync version number
 */
export function setSyncVersion(version: number): void {
    const current = getSyncState();
    if (current) {
        setSyncState({
            ...current,
            version,
        });
    }
}

/**
 * Increment and return the new sync version number
 */
export function incrementSyncVersion(): number {
    const current = getSyncState();
    if (!current) return 1;
    const next = current.version + 1;
    setSyncState({
        ...current,
        version: next,
    });
    return next;
}

// ============================================================================
// Synced Settings Bundle
// ============================================================================

/**
 * Get raw device settings from localStorage for sync
 */
export function getRawDeviceSettings(): SyncedDeviceSettings['settings'] {
    return {
        layoutManagerState: localStorage.getItem('layoutManagerState') || undefined,
        uiSettings: localStorage.getItem('uiSettings') || undefined,
        desktopButtonSettings: localStorage.getItem('desktopButtonSettings') || undefined,
        mobileButtonSettings: localStorage.getItem('mobileButtonSettings') || undefined,
        tripRoutes: localStorage.getItem('tripRoutes') || undefined,
        activeKeymap: localStorage.getItem(ACTIVE_KEYMAP_STORAGE_KEY) || undefined,
    };
}

/**
 * Calculate checksum for the current device settings
 */
export async function calculateSettingsChecksum(): Promise<string> {
    const settings = getRawDeviceSettings();
    const json = JSON.stringify(settings, Object.keys(settings).sort());

    const encoder = new TextEncoder();
    const data = encoder.encode(json);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build a SyncedDeviceSettings object for uploading to cloud
 */
export async function buildSyncedDeviceSettings(): Promise<SyncedDeviceSettings | null> {
    const state = getSyncState();
    if (!state) return null;

    const deviceInfo = getDeviceInfo();
    const checksum = await calculateSettingsChecksum();
    const newVersion = incrementSyncVersion();

    return {
        groupId: state.group.id,
        version: newVersion,
        updatedAt: new Date().toISOString(),
        updatedByDeviceId: deviceInfo.id,
        checksum,
        settings: getRawDeviceSettings(),
    };
}

/**
 * Apply synced settings from another device
 */
export function applySyncedSettings(syncedSettings: SyncedDeviceSettings): void {
    try {
        const { settings } = syncedSettings;

        if (settings.layoutManagerState) {
            localStorage.setItem('layoutManagerState', settings.layoutManagerState);
        }
        if (settings.uiSettings) {
            localStorage.setItem('uiSettings', settings.uiSettings);
        }
        if (settings.desktopButtonSettings) {
            localStorage.setItem('desktopButtonSettings', settings.desktopButtonSettings);
        }
        if (settings.mobileButtonSettings) {
            localStorage.setItem('mobileButtonSettings', settings.mobileButtonSettings);
        }
        if (settings.tripRoutes) {
            localStorage.setItem('tripRoutes', settings.tripRoutes);
        }
        if (settings.activeKeymap) {
            localStorage.setItem(ACTIVE_KEYMAP_STORAGE_KEY, settings.activeKeymap);
            // Re-apply the selected keymap's binds to the flat 'binds' key
            import('@modules/core/keymapStorage').then(({ switchKeymap }) => {
                switchKeymap(settings.activeKeymap!);
            }).catch(() => {
                // keymapStorage may not be available in all contexts
            });
        }

        // Update local version to match remote
        setSyncVersion(syncedSettings.version);

        // Invalidate layout cache and notify LayoutContext to reload
        if (typeof window !== 'undefined') {
            import('@web/layout').then(async ({ invalidateLayoutCache }) => {
                invalidateLayoutCache();
                // Also emit with import type so popups re-evaluate auto-open state
                const eventBus = (await import('@modules/core/eventBus')).default;
                eventBus.emit('layoutManagerStateChanged', { type: 'import' });
            }).catch(async () => {
                const eventBus = (await import('@modules/core/eventBus')).default;
                eventBus.emit('layoutManagerStateChanged', { type: 'import' });
            });
        }
    } catch (err) {
        console.error('Failed to apply synced settings', err);
    }
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

    setSyncState({ group, version: 1 });

    return group;
}
