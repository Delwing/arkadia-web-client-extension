/**
 * Sync Debounce Manager
 *
 * Manages hot vs cold sync categories:
 * - Cold categories (killCounts, visitedRooms): 10-minute debounce or page close
 * - Hot categories: existing debounce (triggers sync including cold)
 */

import type { SyncCategory } from './firebaseTypes';
import { COLD_STORAGE_KEYS, COLD_SYNC_CATEGORIES } from './categoryRegistry';

const COLD_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const HOT_SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds (existing behavior)

export interface SyncDebounceCallbacks {
    onSyncNeeded: () => void;
}

class SyncDebounceManager {
    private coldTimer: ReturnType<typeof setTimeout> | null = null;
    private hotTimer: ReturnType<typeof setTimeout> | null = null;
    private coldDirty = false;
    private hotDirty = false;
    private callbacks: SyncDebounceCallbacks | null = null;
    private visibilityHandler: (() => void) | null = null;
    private initialized = false;

    /**
     * Initialize the manager with callbacks
     */
    initialize(callbacks: SyncDebounceCallbacks): void {
        if (this.initialized) return;

        this.callbacks = callbacks;
        this.initialized = true;

        // Set up visibility change handler for page close/hide
        this.visibilityHandler = () => {
            if (document.visibilityState === 'hidden') {
                this.flushCold();
            }
        };
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        if (this.coldTimer) {
            clearTimeout(this.coldTimer);
            this.coldTimer = null;
        }
        if (this.hotTimer) {
            clearTimeout(this.hotTimer);
            this.hotTimer = null;
        }
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }
        this.callbacks = null;
        this.coldDirty = false;
        this.hotDirty = false;
        this.initialized = false;
    }

    /**
     * Check if a storage key is a cold sync key
     */
    isColdStorageKey(key: string): boolean {
        // Check direct match
        if (COLD_STORAGE_KEYS.has(key)) return true;

        // Check character-scoped keys (e.g., "CharName:kill_counter")
        const colonIdx = key.indexOf(':');
        if (colonIdx > 0) {
            const baseKey = key.substring(colonIdx + 1);
            return COLD_STORAGE_KEYS.has(baseKey);
        }

        return false;
    }

    /**
     * Check if a sync category is cold
     */
    isColdCategory(category: SyncCategory): boolean {
        return COLD_SYNC_CATEGORIES.has(category);
    }

    /**
     * Get cold sync categories
     */
    getColdCategories(): SyncCategory[] {
        return Array.from(COLD_SYNC_CATEGORIES);
    }

    /**
     * Handle a storage change event
     * Returns true if this should trigger any sync behavior
     */
    handleStorageChange(changedKeys: string[]): { shouldSync: boolean; syncType: 'hot' | 'cold' | 'none' } {
        const hasColdChange = changedKeys.some(key => this.isColdStorageKey(key));
        const hasHotChange = changedKeys.some(key => !this.isColdStorageKey(key));

        if (hasHotChange) {
            // Hot change - schedule hot sync (which will include cold)
            this.scheduleHotSync();
            return { shouldSync: true, syncType: 'hot' };
        } else if (hasColdChange) {
            // Cold-only change - schedule cold sync
            this.scheduleColdSync();
            return { shouldSync: true, syncType: 'cold' };
        }

        return { shouldSync: false, syncType: 'none' };
    }

    /**
     * Schedule a hot sync (short debounce)
     */
    private scheduleHotSync(): void {
        this.hotDirty = true;

        // Cancel any pending cold sync since hot will include it
        if (this.coldTimer) {
            clearTimeout(this.coldTimer);
            this.coldTimer = null;
        }
        this.coldDirty = false;

        // Reset hot timer
        if (this.hotTimer) {
            clearTimeout(this.hotTimer);
        }

        this.hotTimer = setTimeout(() => {
            this.hotTimer = null;
            this.hotDirty = false;
            this.callbacks?.onSyncNeeded();
        }, HOT_SYNC_INTERVAL_MS);
    }

    /**
     * Schedule a cold sync (long debounce)
     */
    private scheduleColdSync(): void {
        this.coldDirty = true;

        // Don't reschedule if timer already running
        if (this.coldTimer) return;

        this.coldTimer = setTimeout(() => {
            this.coldTimer = null;
            this.flushCold();
        }, COLD_SYNC_INTERVAL_MS);
    }

    /**
     * Flush cold sync immediately (called on page close)
     */
    flushCold(): void {
        if (!this.coldDirty) return;

        if (this.coldTimer) {
            clearTimeout(this.coldTimer);
            this.coldTimer = null;
        }

        this.coldDirty = false;
        this.callbacks?.onSyncNeeded();
    }

    /**
     * Check if any sync is pending
     */
    hasPendingSync(): boolean {
        return this.coldDirty || this.hotDirty;
    }

    /**
     * Check if cold sync is pending
     */
    hasPendingColdSync(): boolean {
        return this.coldDirty;
    }

    /**
     * Cancel all pending syncs
     */
    cancelAll(): void {
        if (this.coldTimer) {
            clearTimeout(this.coldTimer);
            this.coldTimer = null;
        }
        if (this.hotTimer) {
            clearTimeout(this.hotTimer);
            this.hotTimer = null;
        }
        this.coldDirty = false;
        this.hotDirty = false;
    }
}

// Export singleton instance
export const syncDebounceManager = new SyncDebounceManager();
