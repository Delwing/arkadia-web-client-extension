import type { SyncGroup } from './deviceTypes';
import type { SyncCategory } from '@modules/firebase/firebaseTypes';
import { DEVICE_SCOPED_SYNC_CATEGORIES } from '@modules/firebase/firebaseTypes';

/**
 * localStorage keys that are device-scoped (tied to physical device).
 * These should NOT be auto-applied from a foreign device unless
 * same device or same sync group.
 */
export const DEVICE_SCOPED_STORAGE_KEYS = new Set([
    'layoutManagerState',
    'uiSettings',
    'desktopButtonSettings',
    'active_keymap_id',
]);

/**
 * Sync categories that contain device-scoped keys (derived from the category
 * registry). These need special handling when syncing from a foreign device.
 */
export const DEVICE_SCOPED_CATEGORIES: ReadonlySet<SyncCategory> = DEVICE_SCOPED_SYNC_CATEGORIES;

export interface DeviceScopeContext {
    sourceDeviceId: string;
    currentDeviceId: string;
    currentSyncGroup?: SyncGroup | null;
}

/**
 * Determine if device-scoped settings should be applied.
 * Returns true if:
 * 1. Same device
 * 2. Source device is in current device's sync group
 */
export function shouldApplyDeviceSettings(ctx: DeviceScopeContext): boolean {
    // Same device - always apply
    if (ctx.sourceDeviceId === ctx.currentDeviceId) return true;

    // Source device is a member of current device's sync group - apply
    return !!ctx.currentSyncGroup?.devices.includes(ctx.sourceDeviceId);


}

/**
 * Check if a sync category contains any device-scoped keys.
 */
export function isCategoryDeviceScoped(category: SyncCategory): boolean {
    return DEVICE_SCOPED_CATEGORIES.has(category);
}
