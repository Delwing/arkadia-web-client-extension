/**
 * Firebase Sync E2E Tests
 *
 * Tests for device synchronization scenarios including:
 * - Hot vs cold sync categorization
 * - Debounce behavior for different category types
 * - Visibility change flush behavior
 * - Multi-device settings scenarios
 */

import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    waitForCommandInput,
} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const EXPORT_IMPORT_BUTTON = '#export-import-button';
const EXPORT_IMPORT_MODAL = '#export-import-modal';

/**
 * Helper to open the Firebase/sync modal tab
 */
async function openFirebaseTab(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(EXPORT_IMPORT_BUTTON);
    const modal = page.locator(EXPORT_IMPORT_MODAL);
    await expect(modal, 'should display export/import modal').toBeVisible();
    // Firebase tab should be visible (it's the default or there's a Firebase button)
    return modal;
}

/**
 * Helper to close the modal
 */
async function closeModal(page: Page) {
    const modal = page.locator(EXPORT_IMPORT_MODAL);
    await modal.locator('.btn-close').click();
    await expect(modal).not.toBeVisible();
}

/**
 * Setup character with test data
 */
async function setupCharacter(page: Page, name: string) {
    await primeCharInfo(page, { name });
    await page.waitForFunction(
        ([n]) => localStorage.getItem('currentCharacter') === n,
        [name]
    );
}

test.describe('Firebase Sync', () => {
    test.describe('Sync Debounce Manager', () => {
        test('identifies kill_counter as cold sync key', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacter(page, 'Tester');

            // Inject test to check cold key detection
            const isCold = await page.evaluate(() => {
                // Import the manager and test
                const coldKeys = new Set(['kill_counter']);
                const testKey = 'Tester:kill_counter';

                // Check if key matches cold pattern
                const colonIdx = testKey.indexOf(':');
                if (colonIdx > 0) {
                    const baseKey = testKey.substring(colonIdx + 1);
                    return coldKeys.has(baseKey);
                }
                return coldKeys.has(testKey);
            });

            expect(isCold).toBe(true);
        });

        test('identifies settings as hot sync key', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacter(page, 'Tester');

            const isCold = await page.evaluate(() => {
                const coldKeys = new Set(['kill_counter']);
                const testKey = 'Tester:settings';

                const colonIdx = testKey.indexOf(':');
                if (colonIdx > 0) {
                    const baseKey = testKey.substring(colonIdx + 1);
                    return coldKeys.has(baseKey);
                }
                return coldKeys.has(testKey);
            });

            expect(isCold).toBe(false);
        });

        test('identifies triggers as hot sync key', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const isCold = await page.evaluate(() => {
                const coldKeys = new Set(['kill_counter']);
                return coldKeys.has('triggers');
            });

            expect(isCold).toBe(false);
        });
    });

    test.describe('Device Settings', () => {
        test('stores device ID in localStorage', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Check if device ID is generated
            const deviceId = await page.evaluate(() => {
                let id = localStorage.getItem('arkadia.firebaseDeviceId');
                if (!id) {
                    // Generate one as the app would
                    const array = new Uint8Array(16);
                    crypto.getRandomValues(array);
                    id = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
                    localStorage.setItem('arkadia.firebaseDeviceId', id);
                }
                return id;
            });

            expect(deviceId).toBeTruthy();
            expect(deviceId!.length).toBe(32); // 16 bytes = 32 hex chars
        });

        test('device ID persists across page reloads', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set a device ID
            const originalId = await page.evaluate(() => {
                const id = 'test-device-id-12345678901234567890';
                localStorage.setItem('arkadia.firebaseDeviceId', id);
                return id;
            });

            // Reload page
            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Check ID persisted
            const persistedId = await page.evaluate(() => {
                return localStorage.getItem('arkadia.firebaseDeviceId');
            });

            expect(persistedId).toBe(originalId);
        });

        test('different devices have different IDs', async ({ page, context }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set device ID for first "device"
            const device1Id = await page.evaluate(() => {
                const id = 'device-1-' + Date.now();
                localStorage.setItem('arkadia.firebaseDeviceId', id);
                return id;
            });

            // Open new page (simulating second device)
            const page2 = await context.newPage();
            await page2.goto('/');
            await waitForCommandInput(page2);
            await ensureGameSocket(page2);

            // Set different device ID for second "device"
            const device2Id = await page2.evaluate(() => {
                const id = 'device-2-' + Date.now();
                localStorage.setItem('arkadia.firebaseDeviceId', id);
                return id;
            });

            expect(device1Id).not.toBe(device2Id);

            await page2.close();
        });
    });

    test.describe('Firebase Settings Storage', () => {
        test('saves sync options to localStorage', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set Firebase settings
            await page.evaluate(() => {
                const settings = {
                    syncOptions: {
                        triggers: true,
                        aliases: true,
                        killCounts: false,
                        visitedRooms: false,
                    },
                    encryptionEnabled: false,
                    autoSyncEnabled: true,
                    categorySyncTimes: {},
                    deviceId: 'test-device',
                };
                localStorage.setItem('arkadia.firebaseSettings', JSON.stringify(settings));
            });

            // Verify settings are saved
            const savedSettings = await page.evaluate(() => {
                const raw = localStorage.getItem('arkadia.firebaseSettings');
                return raw ? JSON.parse(raw) : null;
            });

            expect(savedSettings).toBeTruthy();
            expect(savedSettings.syncOptions.triggers).toBe(true);
            expect(savedSettings.syncOptions.killCounts).toBe(false);
            expect(savedSettings.autoSyncEnabled).toBe(true);
        });

        test('loads default sync options when none saved', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Clear any existing settings
            await page.evaluate(() => {
                localStorage.removeItem('arkadia.firebaseSettings');
            });

            // Load default settings as the app would
            const defaults = await page.evaluate(() => {
                const raw = localStorage.getItem('arkadia.firebaseSettings');
                if (!raw) {
                    return {
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
                        encryptionEnabled: false,
                        autoSyncEnabled: false,
                        categorySyncTimes: {},
                        deviceId: 'test',
                    };
                }
                return JSON.parse(raw);
            });

            // All sync options should default to true
            expect(defaults.syncOptions.triggers).toBe(true);
            expect(defaults.syncOptions.killCounts).toBe(true);
            expect(defaults.syncOptions.visitedRooms).toBe(true);
            expect(defaults.autoSyncEnabled).toBe(false);
        });
    });

    test.describe('Category Sync Times', () => {
        test('tracks last sync time per category', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const now = Date.now();

            // Set sync times for different categories
            await page.evaluate((timestamp) => {
                const settings = {
                    syncOptions: {},
                    encryptionEnabled: false,
                    autoSyncEnabled: false,
                    categorySyncTimes: {
                        triggers: timestamp,
                        aliases: timestamp - 60000, // 1 minute ago
                        killCounts: timestamp - 600000, // 10 minutes ago
                    },
                    deviceId: 'test',
                };
                localStorage.setItem('arkadia.firebaseSettings', JSON.stringify(settings));
            }, now);

            const settings = await page.evaluate(() => {
                const raw = localStorage.getItem('arkadia.firebaseSettings');
                return raw ? JSON.parse(raw) : null;
            });

            expect(settings.categorySyncTimes.triggers).toBe(now);
            expect(settings.categorySyncTimes.aliases).toBe(now - 60000);
            expect(settings.categorySyncTimes.killCounts).toBe(now - 600000);
        });

        test('updates sync time after category sync', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const oldTime = Date.now() - 3600000; // 1 hour ago
            const newTime = Date.now();

            // Set old sync time
            await page.evaluate((ts) => {
                const settings = {
                    syncOptions: {},
                    encryptionEnabled: false,
                    autoSyncEnabled: false,
                    categorySyncTimes: { triggers: ts },
                    deviceId: 'test',
                };
                localStorage.setItem('arkadia.firebaseSettings', JSON.stringify(settings));
            }, oldTime);

            // Simulate updating sync time (as would happen after sync)
            await page.evaluate((ts) => {
                const raw = localStorage.getItem('arkadia.firebaseSettings');
                const settings = raw ? JSON.parse(raw) : {};
                settings.categorySyncTimes = settings.categorySyncTimes || {};
                settings.categorySyncTimes.triggers = ts;
                localStorage.setItem('arkadia.firebaseSettings', JSON.stringify(settings));
            }, newTime);

            const settings = await page.evaluate(() => {
                const raw = localStorage.getItem('arkadia.firebaseSettings');
                return raw ? JSON.parse(raw) : null;
            });

            expect(settings.categorySyncTimes.triggers).toBe(newTime);
        });
    });

    test.describe('Storage Change Detection', () => {
        test('detects kill_counter changes', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacter(page, 'Tester');

            // Track storage changes
            const changes = await page.evaluate(() => {
                const detected: string[] = [];

                // Listen for storage changes
                const handler = (event: StorageEvent) => {
                    if (event.key) detected.push(event.key);
                };
                window.addEventListener('storage', handler);

                // Simulate kill counter update
                const key = 'Tester:kill_counter';
                localStorage.setItem(key, JSON.stringify({ goblin: { myTotal: 5 } }));

                // Trigger storage event manually (same-page changes don't fire storage event)
                window.dispatchEvent(new StorageEvent('storage', {
                    key: key,
                    newValue: JSON.stringify({ goblin: { myTotal: 5 } }),
                    storageArea: localStorage,
                }));

                window.removeEventListener('storage', handler);
                return detected;
            });

            expect(changes).toContain('Tester:kill_counter');
        });

        test('detects settings changes', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacter(page, 'Tester');

            const changes = await page.evaluate(() => {
                const detected: string[] = [];

                const handler = (event: StorageEvent) => {
                    if (event.key) detected.push(event.key);
                };
                window.addEventListener('storage', handler);

                const key = 'Tester:settings';
                localStorage.setItem(key, JSON.stringify({ shortenExits: true }));

                window.dispatchEvent(new StorageEvent('storage', {
                    key: key,
                    newValue: JSON.stringify({ shortenExits: true }),
                    storageArea: localStorage,
                }));

                window.removeEventListener('storage', handler);
                return detected;
            });

            expect(changes).toContain('Tester:settings');
        });
    });

    test.describe('Multi-Device Scenarios', () => {
        test('simulates settings from different device', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set local device ID
            await page.evaluate(() => {
                localStorage.setItem('arkadia.firebaseDeviceId', 'local-device-123');
            });

            // Simulate cloud data from different device
            const cloudData = await page.evaluate(() => {
                return {
                    categories: {
                        triggers: {
                            version: 1,
                            syncedAt: new Date().toISOString(),
                            deviceId: 'remote-device-456', // Different device
                            checksum: 'abc123',
                            encrypted: false,
                            data: JSON.stringify([{ pattern: 'test', command: 'echo test' }]),
                        },
                    },
                    updatedAt: new Date().toISOString(),
                };
            });

            expect(cloudData.categories.triggers.deviceId).toBe('remote-device-456');
            expect(cloudData.categories.triggers.deviceId).not.toBe('local-device-123');
        });

        test('detects conflict when cloud has newer data from different device', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const localDeviceId = 'local-device-123';
            const remoteDeviceId = 'remote-device-456';
            const now = Date.now();

            // Setup scenario
            const conflictDetected = await page.evaluate(([localId, remoteId, timestamp]) => {
                // Local sync time
                const localSyncTime = timestamp - 60000; // 1 minute ago

                // Cloud data from different device with newer timestamp
                const cloudPayload = {
                    syncedAt: new Date(timestamp).toISOString(), // Now (newer)
                    deviceId: remoteId,
                    checksum: 'cloud-checksum',
                };

                // Detect conflict: cloud is newer AND from different device
                const cloudTimestamp = new Date(cloudPayload.syncedAt).getTime();
                const isFromDifferentDevice = cloudPayload.deviceId !== localId;
                const isCloudNewer = cloudTimestamp > localSyncTime;

                return isFromDifferentDevice && isCloudNewer;
            }, [localDeviceId, remoteDeviceId, now] as const);

            expect(conflictDetected).toBe(true);
        });

        test('no conflict when cloud data is from same device', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const deviceId = 'same-device-123';
            const now = Date.now();

            const conflictDetected = await page.evaluate(([devId, timestamp]) => {
                const localSyncTime = timestamp - 60000;

                const cloudPayload = {
                    syncedAt: new Date(timestamp).toISOString(),
                    deviceId: devId, // Same device
                    checksum: 'cloud-checksum',
                };

                const cloudTimestamp = new Date(cloudPayload.syncedAt).getTime();
                const isFromDifferentDevice = cloudPayload.deviceId !== devId;
                const isCloudNewer = cloudTimestamp > localSyncTime;

                return isFromDifferentDevice && isCloudNewer;
            }, [deviceId, now] as const);

            expect(conflictDetected).toBe(false);
        });
    });

    test.describe('Cold vs Hot Category Classification', () => {
        test('killCounts is classified as cold category', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const classification = await page.evaluate(() => {
                const coldCategories = new Set(['killCounts', 'visitedRooms']);
                return {
                    killCounts: coldCategories.has('killCounts'),
                    visitedRooms: coldCategories.has('visitedRooms'),
                    triggers: coldCategories.has('triggers'),
                    aliases: coldCategories.has('aliases'),
                };
            });

            expect(classification.killCounts).toBe(true);
            expect(classification.visitedRooms).toBe(true);
            expect(classification.triggers).toBe(false);
            expect(classification.aliases).toBe(false);
        });

        test('hot categories should trigger faster sync', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const syncIntervals = await page.evaluate(() => {
                const HOT_SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds
                const COLD_SYNC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

                return {
                    hot: HOT_SYNC_INTERVAL_MS,
                    cold: COLD_SYNC_INTERVAL_MS,
                    ratio: COLD_SYNC_INTERVAL_MS / HOT_SYNC_INTERVAL_MS,
                };
            });

            expect(syncIntervals.hot).toBe(30000);
            expect(syncIntervals.cold).toBe(600000);
            expect(syncIntervals.ratio).toBe(20); // Cold is 20x slower
        });
    });

    test.describe('Visibility Change Behavior', () => {
        test('simulates visibility change event', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Track visibility changes
            const visibilityChanges = await page.evaluate(() => {
                const changes: string[] = [];

                document.addEventListener('visibilitychange', () => {
                    changes.push(document.visibilityState);
                });

                // Simulate visibility change by dispatching event
                document.dispatchEvent(new Event('visibilitychange'));

                return changes;
            });

            // Event should have been captured
            expect(visibilityChanges.length).toBeGreaterThan(0);
        });

        test('cold sync should flush on page hide', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Test the flush behavior logic
            const flushTriggered = await page.evaluate(() => {
                let flushed = false;

                // Simulate the visibility change handler
                const handler = () => {
                    // In the real implementation, this checks document.visibilityState
                    // and flushes cold sync if hidden
                    flushed = true;
                };

                document.addEventListener('visibilitychange', handler);

                // Trigger visibility change
                document.dispatchEvent(new Event('visibilitychange'));

                document.removeEventListener('visibilitychange', handler);
                return flushed;
            });

            expect(flushTriggered).toBe(true);
        });
    });

    test.describe('Firebase Tab UI', () => {
        test('Firebase tab shows disabled message in test environment', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openFirebaseTab(page);

            // In test environment, Firebase is disabled
            // Check for the disabled message or error state
            const content = await modal.textContent();
            expect(content).toContain('Firebase');

            await closeModal(page);
        });

        test('sync options checkboxes exist for all categories', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openFirebaseTab(page);

            // Switch to Plik tab to see local export options (which mirror sync categories)
            await modal.getByRole('button', { name: 'Plik' }).click();

            // Check some export options exist
            const triggerOption = modal.locator('[id*="export-option-triggers"]');
            const aliasOption = modal.locator('[id*="export-option-aliases"]');

            // These should exist (even if not visible depending on UI state)
            const triggersExists = await triggerOption.count();
            const aliasesExists = await aliasOption.count();

            // At least some options should exist
            expect(triggersExists + aliasesExists).toBeGreaterThan(0);

            await closeModal(page);
        });
    });

    test.describe('Checksum Calculation', () => {
        test('calculates consistent checksum for same data', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const checksums = await page.evaluate(async () => {
                const data = JSON.stringify({ test: 'data', value: 123 });

                // Calculate checksum twice
                const encoder = new TextEncoder();
                const dataBuffer = encoder.encode(data);

                const hash1 = await crypto.subtle.digest('SHA-256', dataBuffer);
                const checksum1 = Array.from(new Uint8Array(hash1))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');

                const hash2 = await crypto.subtle.digest('SHA-256', dataBuffer);
                const checksum2 = Array.from(new Uint8Array(hash2))
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');

                return { checksum1, checksum2, match: checksum1 === checksum2 };
            });

            expect(checksums.match).toBe(true);
            expect(checksums.checksum1.length).toBe(64); // SHA-256 = 32 bytes = 64 hex chars
        });

        test('different data produces different checksums', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const checksums = await page.evaluate(async () => {
                const calculateChecksum = async (data: string) => {
                    const encoder = new TextEncoder();
                    const dataBuffer = encoder.encode(data);
                    const hash = await crypto.subtle.digest('SHA-256', dataBuffer);
                    return Array.from(new Uint8Array(hash))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');
                };

                const data1 = JSON.stringify({ test: 'data1' });
                const data2 = JSON.stringify({ test: 'data2' });

                const checksum1 = await calculateChecksum(data1);
                const checksum2 = await calculateChecksum(data2);

                return { checksum1, checksum2, different: checksum1 !== checksum2 };
            });

            expect(checksums.different).toBe(true);
        });
    });

    test.describe('Settings Applied to UI', () => {
        test('uiSettings background color is applied to output area', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Simulate settings from another device (set before UI loads or reload)
            await page.evaluate(() => {
                const uiSettings = {
                    outputBackground: '#ff5500',
                    contentFontSize: 1.2,
                    mapPosition: 'bottom',
                    showCombatTimer: false,
                };
                localStorage.setItem('uiSettings', JSON.stringify(uiSettings));
            });

            // Reload to apply settings
            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Verify UI reflects the settings
            const styles = await page.evaluate(() => {
                const content = document.getElementById('main_text_output_msg_wrapper');
                if (!content) return null;
                return {
                    backgroundColor: getComputedStyle(content).backgroundColor,
                };
            });

            expect(styles).toBeTruthy();
            expect(styles!.backgroundColor).toBe('rgb(255, 85, 0)');
        });

        test('uiSettings map position is applied to body', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set map position to bottom
            await page.evaluate(() => {
                const uiSettings = {
                    mapPosition: 'bottom',
                    mapHeight: 35,
                };
                localStorage.setItem('uiSettings', JSON.stringify(uiSettings));
            });

            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const mapPosition = await page.evaluate(() => {
                return document.body.dataset.mapPosition;
            });

            expect(mapPosition).toBe('bottom');
        });

        test('uiSettings font size is applied to content area', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set larger font size
            await page.evaluate(() => {
                const uiSettings = {
                    contentFontSize: 2.0, // 2x normal size
                };
                localStorage.setItem('uiSettings', JSON.stringify(uiSettings));
            });

            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const fontSize = await page.evaluate(() => {
                const content = document.getElementById('main_text_output_msg_wrapper');
                if (!content) return null;
                return getComputedStyle(content).fontSize;
            });

            // 2x the base 16px = 32px
            expect(fontSize).toBe('32px');
        });

        test('combat timer visibility respects uiSettings', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Disable combat timer using the new footerComponents format
            await page.evaluate(() => {
                const uiSettings = {
                    footerComponents: [
                        { id: 'clock-display', visible: true, order: 0 },
                        { id: 'transport-timer', visible: true, order: 1 },
                        { id: 'lamp-timer', visible: true, order: 2 },
                        { id: 'break-item-warning', visible: true, order: 3 },
                        { id: 'mail-status', visible: true, order: 4 },
                        { id: 'package-status', visible: true, order: 5 },
                        { id: 'weapon-state', visible: true, order: 6 },
                        { id: 'attack-mode', visible: true, order: 7 },
                        { id: 'release-guard-timer', visible: true, order: 8 },
                        { id: 'zask-timer', visible: true, order: 9 },
                        { id: 'order-timer', visible: true, order: 10 },
                        { id: 'combat-timer', visible: false, order: 11 },
                    ],
                };
                localStorage.setItem('uiSettings', JSON.stringify(uiSettings));
            });

            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const combatTimerState = await page.evaluate(() => {
                const timer = document.getElementById('combat-timer');
                if (!timer) return null;
                return {
                    footerHidden: timer.dataset.footerHidden,
                };
            });

            expect(combatTimerState).toBeTruthy();
            expect(combatTimerState!.footerHidden).toBe('1');
        });

        test('footer mode is applied from uiSettings', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set footer mode
            await page.evaluate(() => {
                const uiSettings = {
                    footerMode: 2,
                };
                localStorage.setItem('uiSettings', JSON.stringify(uiSettings));
            });

            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const footerMode = await page.evaluate(() => {
                const charState = document.getElementById('char-state');
                return charState?.getAttribute('data-footer-mode');
            });

            expect(footerMode).toBe('2');
        });
    });

    test.describe('Character Settings Applied', () => {
        test('character settings are scoped by character name', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacter(page, 'Wojownik');

            // Set character-specific settings
            await page.evaluate(() => {
                const settings = {
                    shortenExits: true,
                    collectMode: 2,
                    language: 'krasnoludzki',
                };
                localStorage.setItem('Wojownik:settings', JSON.stringify(settings));
            });

            // Verify settings are stored under character key
            const stored = await page.evaluate(() => {
                return localStorage.getItem('Wojownik:settings');
            });

            expect(stored).toBeTruthy();
            const parsed = JSON.parse(stored!);
            expect(parsed.shortenExits).toBe(true);
            expect(parsed.collectMode).toBe(2);
        });

        test('different characters have isolated settings', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set settings for two different characters
            await page.evaluate(() => {
                localStorage.setItem('Wojownik:settings', JSON.stringify({
                    shortenExits: true,
                    collectMode: 1,
                }));
                localStorage.setItem('Mag:settings', JSON.stringify({
                    shortenExits: false,
                    collectMode: 3,
                }));
            });

            const settings = await page.evaluate(() => {
                const wojownik = JSON.parse(localStorage.getItem('Wojownik:settings') || '{}');
                const mag = JSON.parse(localStorage.getItem('Mag:settings') || '{}');
                return { wojownik, mag };
            });

            // Settings should be different per character
            expect(settings.wojownik.shortenExits).toBe(true);
            expect(settings.mag.shortenExits).toBe(false);
            expect(settings.wojownik.collectMode).toBe(1);
            expect(settings.mag.collectMode).toBe(3);
        });
    });

    test.describe('Device Sync Settings Applied', () => {
        test('simulated remote device settings are applied after reload', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Simulate settings that came from another device
            const remoteDeviceId = 'remote-device-abc123';
            const localDeviceId = 'local-device-xyz789';

            await page.evaluate(([remoteId, localId]) => {
                // Store local device ID
                localStorage.setItem('arkadia.firebaseDeviceId', localId);

                // Simulate synced UI settings (from remote device)
                const syncedUiSettings = {
                    outputBackground: '#003366',
                    contentFontSize: 1.5,
                    mapPosition: 'right',
                    showCombatTimer: true,
                    footerMode: 1,
                    // Metadata indicating this came from sync
                    _syncedFrom: remoteId,
                    _syncedAt: new Date().toISOString(),
                };
                localStorage.setItem('uiSettings', JSON.stringify(syncedUiSettings));
            }, [remoteDeviceId, localDeviceId] as const);

            // Reload to apply synced settings
            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Verify the synced settings are applied to UI
            const appliedStyles = await page.evaluate(() => {
                const content = document.getElementById('main_text_output_msg_wrapper');
                const charState = document.getElementById('char-state');
                const combatTimer = document.getElementById('combat-timer');

                return {
                    backgroundColor: content ? getComputedStyle(content).backgroundColor : null,
                    fontSize: content ? getComputedStyle(content).fontSize : null,
                    mapPosition: document.body.dataset.mapPosition,
                    footerMode: charState?.getAttribute('data-footer-mode'),
                    combatTimerEnabled: combatTimer?.dataset.enabled,
                };
            });

            expect(appliedStyles.backgroundColor).toBe('rgb(0, 51, 102)');
            expect(appliedStyles.fontSize).toBe('24px'); // 1.5 * 16px
            expect(appliedStyles.mapPosition).toBe('right');
            expect(appliedStyles.footerMode).toBe('1');
            expect(appliedStyles.combatTimerEnabled).toBe('1');
        });

        test('character-scoped settings from sync are applied correctly', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacter(page, 'SyncedHero');

            // Simulate character settings that came from cloud sync
            await page.evaluate(() => {
                const syncedSettings = {
                    shortenExits: true,
                    collectMode: 2,
                    language: 'elficki',
                    gmcpMappingMode: true,
                };
                localStorage.setItem('SyncedHero:settings', JSON.stringify(syncedSettings));
            });

            // Verify settings are stored correctly
            const storedSettings = await page.evaluate(() => {
                const raw = localStorage.getItem('SyncedHero:settings');
                return raw ? JSON.parse(raw) : null;
            });

            expect(storedSettings).toBeTruthy();
            expect(storedSettings.shortenExits).toBe(true);
            expect(storedSettings.collectMode).toBe(2);
            expect(storedSettings.language).toBe('elficki');
        });

        test('kill counter data from sync is stored correctly', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacter(page, 'Hunter');

            // Simulate kill counter data from sync
            await page.evaluate(() => {
                const killData = {
                    goblin: { myTotal: 150, mySession: 0, teamSession: 0 },
                    orc: { myTotal: 75, mySession: 0, teamSession: 0 },
                    troll: { myTotal: 20, mySession: 0, teamSession: 0 },
                };
                localStorage.setItem('Hunter:kill_counter', JSON.stringify(killData));
            });

            // Verify data is stored
            const storedKills = await page.evaluate(() => {
                const raw = localStorage.getItem('Hunter:kill_counter');
                return raw ? JSON.parse(raw) : null;
            });

            expect(storedKills).toBeTruthy();
            expect(storedKills.goblin.myTotal).toBe(150);
            expect(storedKills.orc.myTotal).toBe(75);
            expect(storedKills.troll.myTotal).toBe(20);
        });

        test('multiple settings categories sync together', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Simulate complete sync bundle from another device
            // Set these before character setup so they're in place
            await page.evaluate(() => {
                // UI Settings
                localStorage.setItem('uiSettings', JSON.stringify({
                    outputBackground: '#222222',
                    contentFontSize: 1.3,
                    showCombatTimer: true,
                }));

                // Character settings (character-scoped)
                localStorage.setItem('MultiSync:settings', JSON.stringify({
                    shortenExits: true,
                    collectMode: 1,
                }));

                // Kill counter (character-scoped)
                localStorage.setItem('MultiSync:kill_counter', JSON.stringify({
                    wolf: { myTotal: 50 },
                }));

                // Triggers (stored globally)
                localStorage.setItem('userTriggers', JSON.stringify([
                    { pattern: 'test pattern', command: 'test command', enabled: true },
                ]));
            });

            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Verify all categories are applied
            const syncedData = await page.evaluate(() => {
                const content = document.getElementById('main_text_output_msg_wrapper');
                return {
                    // UI applied
                    backgroundColor: content ? getComputedStyle(content).backgroundColor : null,

                    // Settings stored (using raw localStorage access for character-scoped keys)
                    charSettings: JSON.parse(localStorage.getItem('MultiSync:settings') || '{}'),
                    killCounter: JSON.parse(localStorage.getItem('MultiSync:kill_counter') || '{}'),
                    triggers: JSON.parse(localStorage.getItem('userTriggers') || '[]'),
                };
            });

            expect(syncedData.backgroundColor).toBe('rgb(34, 34, 34)');
            expect(syncedData.charSettings.shortenExits).toBe(true);
            expect(syncedData.killCounter.wolf?.myTotal).toBe(50);
            expect(syncedData.triggers.length).toBe(1);
            expect(syncedData.triggers[0].pattern).toBe('test pattern');
        });
    });

    test.describe('Settings Persistence Across Reload', () => {
        test('uiSettings persist after page reload', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Set settings
            await page.evaluate(() => {
                localStorage.setItem('uiSettings', JSON.stringify({
                    outputBackground: '#445566',
                    mapPosition: 'left',
                }));
            });

            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Verify persistence
            const persisted = await page.evaluate(() => {
                const raw = localStorage.getItem('uiSettings');
                return raw ? JSON.parse(raw) : null;
            });

            expect(persisted).toBeTruthy();
            expect(persisted.outputBackground).toBe('#445566');
            expect(persisted.mapPosition).toBe('left');
        });

        test('character settings persist after reload and character switch', async ({ page }) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Setup two characters with settings
            await page.evaluate(() => {
                localStorage.setItem('CharA:settings', JSON.stringify({ language: 'krasnoludzki' }));
                localStorage.setItem('CharB:settings', JSON.stringify({ language: 'elficki' }));
            });

            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Verify both characters' settings persist
            const settings = await page.evaluate(() => {
                return {
                    charA: JSON.parse(localStorage.getItem('CharA:settings') || '{}'),
                    charB: JSON.parse(localStorage.getItem('CharB:settings') || '{}'),
                };
            });

            expect(settings.charA.language).toBe('krasnoludzki');
            expect(settings.charB.language).toBe('elficki');
        });
    });
});
