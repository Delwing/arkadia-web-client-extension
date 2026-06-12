/**
 * Firebase Mock Infrastructure for E2E Tests
 *
 * Provides mock implementations of Firebase services:
 * - Firestore (document read/write)
 * - Auth (user authentication)
 * - Storage simulation in memory
 */

import type { BrowserContext, Page } from '@playwright/test';

// Types for mock data
export interface MockUser {
    uid: string;
    email: string;
    displayName: string;
}

export interface MockCategoryPayload {
    version: number;
    syncedAt: string;
    deviceId: string;
    checksum: string;
    encrypted: boolean;
    data: string;
}

export interface MockSyncData {
    categories?: {
        [key: string]: MockCategoryPayload;
    };
    devices?: {
        [deviceId: string]: {
            id: string;
            name: string;
            lastSeen: string;
        };
    };
    updatedAt?: string;
}

// Default mock user
export const DEFAULT_MOCK_USER: MockUser = {
    uid: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Test User',
};

// Device simulation
export interface MockDevice {
    id: string;
    name: string;
}

export const MOCK_DEVICE_1: MockDevice = {
    id: 'device-1-abc123',
    name: 'Chrome on Windows',
};

export const MOCK_DEVICE_2: MockDevice = {
    id: 'device-2-def456',
    name: 'Firefox on Linux',
};

/**
 * Install mock Firebase in browser context
 * This replaces the Firebase SDK with mock implementations
 */
export async function installMockFirebase(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
        // Mark Firebase as mocked (not disabled)
        (window as any).__MOCK_FIREBASE__ = true;
        (window as any).__DISABLE_FIREBASE__ = false;

        // In-memory Firestore storage
        (window as any).__MOCK_FIRESTORE_DATA__ = {};
        (window as any).__MOCK_AUTH_USER__ = null;
        (window as any).__MOCK_DEVICE_ID__ = 'device-1-abc123';

        // Track Firebase operations for assertions
        (window as any).__FIREBASE_OPERATIONS__ = [];
    });
}

/**
 * Set mock authenticated user
 */
export async function setMockUser(page: Page, user: MockUser | null): Promise<void> {
    await page.evaluate((u) => {
        (window as any).__MOCK_AUTH_USER__ = u;
        // Dispatch auth state change event
        window.dispatchEvent(new CustomEvent('mock-firebase-auth-change', { detail: u }));
    }, user);
}

/**
 * Set mock device ID
 */
export async function setMockDeviceId(page: Page, deviceId: string): Promise<void> {
    await page.evaluate((id) => {
        (window as any).__MOCK_DEVICE_ID__ = id;
        localStorage.setItem('arkadia.firebaseDeviceId', id);
    }, deviceId);
}

/**
 * Set cloud data (simulates data already in Firestore)
 */
export async function setCloudData(page: Page, userId: string, data: MockSyncData): Promise<void> {
    await page.evaluate(([uid, syncData]) => {
        const path = `users/${uid}/sync/syncData`;
        (window as any).__MOCK_FIRESTORE_DATA__[path] = {
            ...syncData,
            updatedAt: new Date().toISOString(),
        };
    }, [userId, data] as const);
}

/**
 * Get cloud data (for assertions)
 */
export async function getCloudData(page: Page, userId: string): Promise<MockSyncData | null> {
    return await page.evaluate((uid) => {
        const path = `users/${uid}/sync/syncData`;
        return (window as any).__MOCK_FIRESTORE_DATA__[path] || null;
    }, userId);
}

/**
 * Get Firebase operations log
 */
export async function getFirebaseOperations(page: Page): Promise<Array<{type: string; path: string; data?: any; timestamp: number}>> {
    return await page.evaluate(() => {
        return (window as any).__FIREBASE_OPERATIONS__ || [];
    });
}

/**
 * Clear Firebase operations log
 */
export async function clearFirebaseOperations(page: Page): Promise<void> {
    await page.evaluate(() => {
        (window as any).__FIREBASE_OPERATIONS__ = [];
    });
}

/**
 * Get count of write operations
 */
export async function getWriteOperationCount(page: Page): Promise<number> {
    const ops = await getFirebaseOperations(page);
    return ops.filter(op => op.type === 'write' || op.type === 'setDoc').length;
}

/**
 * Wait for a Firebase write operation
 */
export async function waitForFirebaseWrite(page: Page, timeout = 5000): Promise<void> {
    const startCount = await getWriteOperationCount(page);
    await page.waitForFunction(
        (start) => {
            const ops = (window as any).__FIREBASE_OPERATIONS__ || [];
            const writeCount = ops.filter((op: any) => op.type === 'write' || op.type === 'setDoc').length;
            return writeCount > start;
        },
        startCount,
        { timeout }
    );
}

/**
 * Simulate category conflict (cloud has newer data from different device)
 */
export async function simulateConflict(
    page: Page,
    userId: string,
    category: string,
    cloudDeviceId: string,
    cloudData: string
): Promise<void> {
    await page.evaluate(([uid, cat, devId, data]) => {
        const path = `users/${uid}/sync/syncData`;
        const existing = (window as any).__MOCK_FIRESTORE_DATA__[path] || { categories: {} };

        existing.categories = existing.categories || {};
        existing.categories[cat] = {
            version: 1,
            syncedAt: new Date().toISOString(),
            deviceId: devId,
            checksum: 'conflict-checksum-' + Math.random().toString(36).substr(2, 9),
            encrypted: false,
            data: data,
        };
        existing.updatedAt = new Date().toISOString();

        (window as any).__MOCK_FIRESTORE_DATA__[path] = existing;
    }, [userId, category, cloudDeviceId, cloudData] as const);
}

/**
 * Enable Firebase settings in localStorage
 */
export async function enableFirebaseSettings(page: Page, options: {
    autoSync?: boolean;
    encryption?: boolean;
    categories?: string[];
} = {}): Promise<void> {
    await page.evaluate((opts) => {
        const settings = {
            syncOptions: {
                uiSettings: true,
                binds: true,
                shortcuts: true,
                characterSettings: true,
                triggers: true,
                aliases: true,
                multibinds: true,
                buttons: true,
                radial: true,
                visitedRooms: true,
                locationNotes: true,
                killCounts: true,
                improveCounts: true,
                deposits: true,
                containers: true,
            },
            encryptionEnabled: opts.encryption ?? false,
            autoSyncEnabled: opts.autoSync ?? false,
            categorySyncTimes: {},
            deviceId: (window as any).__MOCK_DEVICE_ID__ || 'test-device',
        };

        // Apply category overrides
        if (opts.categories) {
            Object.keys(settings.syncOptions).forEach(key => {
                (settings.syncOptions as any)[key] = opts.categories!.includes(key);
            });
        }

        localStorage.setItem('arkadia.firebaseSettings', JSON.stringify(settings));
    }, options);
}

/**
 * Trigger a storage change event (simulates user action)
 */
export async function triggerStorageChange(page: Page, key: string, value: any): Promise<void> {
    await page.evaluate(([k, v]) => {
        const oldValue = localStorage.getItem(k);
        localStorage.setItem(k, JSON.stringify(v));

        // Dispatch storage event to trigger listeners
        const event = new StorageEvent('storage', {
            key: k,
            oldValue: oldValue,
            newValue: JSON.stringify(v),
            storageArea: localStorage,
        });
        window.dispatchEvent(event);
    }, [key, value] as const);
}

/**
 * Simulate visibility change (tab hide/show)
 */
export async function simulateVisibilityChange(page: Page, hidden: boolean): Promise<void> {
    await page.evaluate((isHidden) => {
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => isHidden ? 'hidden' : 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
}

/**
 * Get pending cold sync state
 */
export async function hasPendingColdSync(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
        // Access the sync debounce manager state
        const manager = (window as any).__syncDebounceManager__;
        return manager ? manager.hasPendingColdSync() : false;
    });
}

/**
 * Setup mock Firebase config in localStorage
 */
export async function setupMockFirebaseConfig(page: Page): Promise<void> {
    await page.evaluate(() => {
        const config = {
            apiKey: 'mock-api-key',
            authDomain: 'mock-project.firebaseapp.com',
            projectId: 'mock-project',
            storageBucket: 'mock-project.appspot.com',
            messagingSenderId: '123456789',
            appId: '1:123456789:web:abcdef',
        };
        localStorage.setItem('arkadia.firebaseConfig', JSON.stringify(config));
    });
}

/**
 * Helper to calculate a simple checksum (matching the app's logic)
 */
export async function calculateChecksum(page: Page, data: string): Promise<string> {
    return await page.evaluate(async (d) => {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(d);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }, data);
}
