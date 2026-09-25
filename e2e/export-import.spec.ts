import {expect, test} from './support/fixtures';
import type {Page, Download} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    waitForCommandInput,
} from './support/mocks';
import {goToSettingsPage} from './support/settings';
import * as fs from 'fs';

const MENU_BUTTON = '#menu-button';
const SETTINGS_BUTTON = '#settings-button';
// Export/import lives in the settings dialog ("Dane" pages) now.
const EXPORT_IMPORT_MODAL = '#settings-modal';
const LOCAL_FILE_INPUT = '#settings-modal .settings-page[data-settings-category="data-backup"] input[type="file"][accept="application/json"]';

async function openExportImportModal(page: Page) {
    // Restoring asks for confirmation; accept it.
    page.on('dialog', dialog => void dialog.accept());
    await page.click(MENU_BUTTON);
    await page.click(SETTINGS_BUTTON);
    const modal = page.locator(EXPORT_IMPORT_MODAL);
    await expect(modal, 'should display export/import modal').toBeVisible();
    // The file export is on Kopia zapasowa.
    await goToSettingsPage(page, 'data-backup');
    // Wait for Local tab content to load
    await expect(modal.getByRole('button', {name: 'Eksportuj dane'})).toBeVisible();
    // Scope to the page: the dialog holds other pages' file inputs and notices.
    return page.locator('#settings-modal .settings-page[data-settings-category="data-backup"]');
}

async function closeExportImportModal(page: Page) {
    const modal = page.locator(EXPORT_IMPORT_MODAL);
    await modal.locator('.app-modal__close').click();
    await expect(modal, 'should close export/import modal').not.toBeVisible();
}

async function setupCharacterData(page: Page, characterName: string) {
    await primeCharInfo(page, {name: characterName});
    await page.waitForFunction(
        ([name]) => localStorage.getItem('currentCharacter') === name,
        [characterName]
    );

    // Add some test data for the character
    await page.evaluate(([char]) => {
        localStorage.setItem(`${char}:settings`, JSON.stringify({
            shortenExits: true,
            collectMode: 2,
        }));
        localStorage.setItem(`${char}:customData`, 'test-value');
    }, [characterName]);
}

test.describe('Export/Import', () => {
    test.describe('Modal opening and closing', () => {
        test('opens and closes export/import modal', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            await openExportImportModal(page);
            await expect(page.locator(EXPORT_IMPORT_MODAL).locator('.app-modal__title')).toContainText('Ustawienia');
            await closeExportImportModal(page);
        });
    });

    test.describe('Backup contents', () => {
        test('has no character or data selection: a backup always contains everything', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacterData(page, 'Wojownik');

            const modal = await openExportImportModal(page);

            await expect(modal.locator('[id^="export-character-"]'), 'no character checkboxes').toHaveCount(0);
            await expect(modal.locator('[id^="export-option-"]'), 'no data checkboxes').toHaveCount(0);
            await expect(modal, 'explains what the backup contains').toContainText('wszystkie Twoje dane');

            await closeExportImportModal(page);
        });
    });

    test.describe('Local export', () => {
        test('exports data to JSON file with correct filename format', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacterData(page, 'ExportTest');

            const modal = await openExportImportModal(page);

            // Wait for download event
            const downloadPromise = page.waitForEvent('download');

            await modal.getByRole('button', {name: 'Eksportuj dane'}).click();

            const download: Download = await downloadPromise;
            const filename = download.suggestedFilename();

            expect(filename, 'filename should start with arkadia-backup-').toMatch(/^arkadia-backup-/);
            expect(filename, 'filename should end with .json').toMatch(/\.json$/);

            // Verify success message
            const successAlert = modal.locator('.popup-notice--success');
            await expect(successAlert, 'should show success message').toContainText('Eksport zakończony sukcesem');

            await closeExportImportModal(page);
        });

        test('exported file contains valid JSON with expected structure', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Setup test data
            await page.evaluate(() => {
                localStorage.setItem('triggers', JSON.stringify([{pattern: 'test', command: 'say test'}]));
                localStorage.setItem('TestChar:settings', JSON.stringify({shortenExits: true}));
            });

            const modal = await openExportImportModal(page);

            const downloadPromise = page.waitForEvent('download');
            await modal.getByRole('button', {name: 'Eksportuj dane'}).click();

            const download: Download = await downloadPromise;
            const path = await download.path();
            const content = fs.readFileSync(path!, 'utf-8');
            const payload = JSON.parse(content);

            expect(payload.version, 'should have version 2').toBe(2);
            expect(payload.createdAt, 'should have createdAt timestamp').toBeDefined();
            expect(payload.device?.sourceDevice?.id, 'should name the exporting device').toBeTruthy();
            expect(payload.categories, 'should have categories object').toBeDefined();
            expect(JSON.parse(payload.categories.triggers).triggers, 'should contain triggers')
                .toBe(JSON.stringify([{pattern: 'test', command: 'say test'}]));
            expect(JSON.parse(payload.categories.characterSettings).TestChar, 'should contain character settings')
                .toBeDefined();

            await closeExportImportModal(page);
        });

        test('export includes every character', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            await page.evaluate(() => {
                localStorage.setItem('FirstChar:settings', JSON.stringify({shortenExits: true}));
                localStorage.setItem('SecondChar:settings', JSON.stringify({shortenExits: false}));
            });

            const modal = await openExportImportModal(page);

            const downloadPromise = page.waitForEvent('download');
            await modal.getByRole('button', {name: 'Eksportuj dane'}).click();

            const download: Download = await downloadPromise;
            const path = await download.path();
            const payload = JSON.parse(fs.readFileSync(path!, 'utf-8'));
            const characters = JSON.parse(payload.categories.characterSettings);

            expect(characters.FirstChar, 'should have FirstChar data').toBeDefined();
            expect(characters.SecondChar, 'should have SecondChar data').toBeDefined();

            await closeExportImportModal(page);
        });
    });

    test.describe('Local import', () => {
        test('imports a legacy (version 1) backup file and shows success message', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openExportImportModal(page);

            const validPayload = {
                version: 1,
                createdAt: new Date().toISOString(),
                characters: ['ImportedChar'],
                localStorage: {
                    global: {
                        triggers: JSON.stringify([{pattern: 'imported', command: 'say imported'}]),
                    },
                    characters: {
                        ImportedChar: {
                            'ImportedChar:settings': JSON.stringify({shortenExits: true, collectMode: 3}),
                        },
                    },
                },
                indexedDB: {
                    multibinds: [],
                    visitedRooms: [],
                },
            };

            // Set file input
            await page.setInputFiles(LOCAL_FILE_INPUT, {
                name: 'test-backup.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(validPayload)),
            });

            // Verify success message
            const successAlert = modal.locator('.popup-notice--success');
            await expect(successAlert, 'should show success message').toContainText('Import zakończony sukcesem');

            // Verify data was imported
            const importedSettings = await page.evaluate(() => {
                return localStorage.getItem('ImportedChar:settings');
            });
            expect(importedSettings, 'should have imported character settings').toBeDefined();
            const parsed = JSON.parse(importedSettings!);
            expect(parsed.shortenExits, 'shortenExits should be true').toBe(true);
            expect(parsed.collectMode, 'collectMode should be 3').toBe(3);

            const importedTriggers = await page.evaluate(() => {
                return localStorage.getItem('triggers');
            });
            expect(importedTriggers, 'should have imported triggers').toBeDefined();

            await closeExportImportModal(page);
        });

        test('import button opens file dialog', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openExportImportModal(page);

            // Check that file input exists and is hidden
            const fileInput = modal.locator('input[type="file"]');
            await expect(fileInput, 'file input should exist').toBeAttached();

            // The file input should have display: none
            const isHidden = await fileInput.evaluate((el: HTMLElement) => {
                return el.style.display === 'none' || getComputedStyle(el).display === 'none';
            });
            expect(isHidden, 'file input should be hidden').toBe(true);

            await closeExportImportModal(page);
        });

        test('shows error for invalid JSON file', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openExportImportModal(page);

            // Try to import invalid JSON
            await page.setInputFiles(LOCAL_FILE_INPUT, {
                name: 'invalid.json',
                mimeType: 'application/json',
                buffer: Buffer.from('not valid json'),
            });

            // Verify error message
            // The Google Drive section on the same page shows its own error when its script can't load.
            const errorAlert = modal.locator('.popup-notice--danger', {hasText: 'zaimportować'});
            await expect(errorAlert, 'should show error message').toContainText('Nie udało się zaimportować danych');

            await closeExportImportModal(page);
        });

        test('shows error for wrong payload version', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openExportImportModal(page);

            const invalidPayload = {
                version: 999, // Wrong version
                createdAt: new Date().toISOString(),
                localStorage: {},
                indexedDB: {},
            };

            await page.setInputFiles(LOCAL_FILE_INPUT, {
                name: 'wrong-version.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(invalidPayload)),
            });

            // The Google Drive section on the same page shows its own error when its script can't load.
            const errorAlert = modal.locator('.popup-notice--danger', {hasText: 'zaimportować'});
            await expect(errorAlert, 'should show error for wrong version').toContainText('Nie udało się zaimportować danych');

            await closeExportImportModal(page);
        });

        test('shows error for missing required fields', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openExportImportModal(page);

            const incompletePayload = {
                version: 1,
                // Missing createdAt, localStorage, indexedDB
            };

            await page.setInputFiles(LOCAL_FILE_INPUT, {
                name: 'incomplete.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(incompletePayload)),
            });

            // The Google Drive section on the same page shows its own error when its script can't load.
            const errorAlert = modal.locator('.popup-notice--danger', {hasText: 'zaimportować'});
            await expect(errorAlert, 'should show error for incomplete payload').toContainText('Nie udało się zaimportować danych');

            await closeExportImportModal(page);
        });
    });

    test.describe('Round-trip export and import', () => {
        test('exported data can be re-imported correctly', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Setup initial data
            const originalTriggers = [{pattern: 'round-trip-test', command: 'say round-trip'}];
            const originalAliases = [{pattern: 'rtt', command: 'powiedz test'}];
            await page.evaluate(([triggers, aliases]) => {
                localStorage.setItem('triggers', triggers);
                localStorage.setItem('aliases', aliases);
                localStorage.setItem('RoundTrip:settings', JSON.stringify({
                    shortenExits: true,
                    collectMode: 2,
                    language: 'krasnoludzki',
                }));
            }, [JSON.stringify(originalTriggers), JSON.stringify(originalAliases)]);

            const modal = await openExportImportModal(page);

            // Export
            const downloadPromise = page.waitForEvent('download');
            await modal.getByRole('button', {name: 'Eksportuj dane'}).click();
            const download: Download = await downloadPromise;
            const path = await download.path();
            const exportedContent = fs.readFileSync(path!, 'utf-8');

            // Clear localStorage
            await page.evaluate(() => {
                localStorage.removeItem('triggers');
                localStorage.removeItem('aliases');
                localStorage.removeItem('RoundTrip:settings');
            });

            // Verify data was cleared
            const triggersAfterClear = await page.evaluate(() => localStorage.getItem('triggers'));
            expect(triggersAfterClear, 'triggers should be cleared').toBeNull();

            // Re-import the exported file
            await page.setInputFiles(LOCAL_FILE_INPUT, {
                name: 'round-trip.json',
                mimeType: 'application/json',
                buffer: Buffer.from(exportedContent),
            });

            // Verify success
            const successAlert = modal.locator('.popup-notice--success');
            await expect(successAlert, 'should show import success').toContainText('Import zakończony sukcesem');

            // Verify data was restored
            const restoredTriggers = await page.evaluate(() => localStorage.getItem('triggers'));
            const restoredAliases = await page.evaluate(() => localStorage.getItem('aliases'));
            const restoredSettings = await page.evaluate(() => localStorage.getItem('RoundTrip:settings'));

            expect(restoredTriggers, 'triggers should be restored').toBe(JSON.stringify(originalTriggers));
            expect(restoredAliases, 'aliases should be restored').toBe(JSON.stringify(originalAliases));

            const settings = JSON.parse(restoredSettings!);
            expect(settings.shortenExits, 'shortenExits should be restored').toBe(true);
            expect(settings.collectMode, 'collectMode should be restored').toBe(2);
            expect(settings.language, 'language should be restored').toBe('krasnoludzki');

            await closeExportImportModal(page);
        });
    });
});
