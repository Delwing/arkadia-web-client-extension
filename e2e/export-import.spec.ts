import {expect, test} from './support/fixtures';
import type {Page, Download} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    waitForCommandInput,
} from './support/mocks';
import * as fs from 'fs';

const MENU_BUTTON = '#menu-button';
const EXPORT_IMPORT_BUTTON = '#export-import-button';
const EXPORT_IMPORT_MODAL = '#export-import-modal';

async function openExportImportModal(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(EXPORT_IMPORT_BUTTON);
    const modal = page.locator(EXPORT_IMPORT_MODAL);
    await expect(modal, 'should display export/import modal').toBeVisible();
    return modal;
}

async function closeExportImportModal(page: Page) {
    const modal = page.locator(EXPORT_IMPORT_MODAL);
    await modal.locator('.btn-close').click();
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

            const modal = await openExportImportModal(page);
            await expect(modal.locator('.modal-title')).toContainText('Eksport i import');
            await closeExportImportModal(page);
        });
    });

    test.describe('Character selection', () => {
        test('displays detected characters and allows selection', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await setupCharacterData(page, 'Wojownik');

            // Add another character data to localStorage
            await page.evaluate(() => {
                localStorage.setItem('Mag:settings', JSON.stringify({language: 'krasnoludzki'}));
            });

            const modal = await openExportImportModal(page);

            // Both characters should be listed
            const wojownikCheckbox = modal.locator('#export-character-Wojownik');
            const magCheckbox = modal.locator('#export-character-Mag');

            await expect(wojownikCheckbox, 'should display Wojownik checkbox').toBeVisible();
            await expect(magCheckbox, 'should display Mag checkbox').toBeVisible();

            // Both should be checked by default
            await expect(wojownikCheckbox, 'Wojownik should be checked by default').toBeChecked();
            await expect(magCheckbox, 'Mag should be checked by default').toBeChecked();

            await closeExportImportModal(page);
        });

        test('select all and none buttons work for characters', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Setup multiple characters
            await page.evaluate(() => {
                localStorage.setItem('Elf:settings', JSON.stringify({shortenExits: true}));
                localStorage.setItem('Krasnolud:settings', JSON.stringify({shortenExits: false}));
            });

            const modal = await openExportImportModal(page);

            const elfCheckbox = modal.locator('#export-character-Elf');
            const krasnolCheckbox = modal.locator('#export-character-Krasnolud');

            // Click "Żadna" (select none)
            await modal.getByRole('button', {name: 'Żadna'}).click();
            await expect(elfCheckbox, 'Elf should be unchecked after none').not.toBeChecked();
            await expect(krasnolCheckbox, 'Krasnolud should be unchecked after none').not.toBeChecked();

            // Click "Wszystkie" (select all)
            await modal.getByRole('button', {name: 'Wszystkie'}).click();
            await expect(elfCheckbox, 'Elf should be checked after all').toBeChecked();
            await expect(krasnolCheckbox, 'Krasnolud should be checked after all').toBeChecked();

            await closeExportImportModal(page);
        });

        test('individual character toggle works', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            await page.evaluate(() => {
                localStorage.setItem('Tropiciel:settings', JSON.stringify({shortenExits: true}));
            });

            const modal = await openExportImportModal(page);

            const checkbox = modal.locator('#export-character-Tropiciel');
            await expect(checkbox, 'should be checked initially').toBeChecked();

            await checkbox.uncheck();
            await expect(checkbox, 'should be unchecked after click').not.toBeChecked();

            await checkbox.check();
            await expect(checkbox, 'should be checked after second click').toBeChecked();

            await closeExportImportModal(page);
        });
    });

    test.describe('Export options selection', () => {
        test('all export options are checked by default', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openExportImportModal(page);

            const options = [
                'export-option-globalSettings',
                'export-option-characterSettings',
                'export-option-triggers',
                'export-option-aliases',
                'export-option-multibinds',
                'export-option-scripts',
                'export-option-buttons',
                'export-option-radial',
                'export-option-recordings',
                'export-option-visitedRooms',
            ];

            for (const optionId of options) {
                const checkbox = modal.locator(`#${optionId}`);
                await expect(checkbox, `${optionId} should be checked by default`).toBeChecked();
            }

            await closeExportImportModal(page);
        });

        test('select all and none buttons work for export options', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openExportImportModal(page);

            // Locate export options section - it has "Dane do eksportu" label
            const optionsSection = modal.locator('.border.rounded.p-3').filter({hasText: 'Dane do eksportu'});

            // Click "Nic" (select none)
            await optionsSection.getByRole('button', {name: 'Nic'}).click();

            const triggersCheckbox = modal.locator('#export-option-triggers');
            const aliasesCheckbox = modal.locator('#export-option-aliases');
            await expect(triggersCheckbox, 'triggers should be unchecked after none').not.toBeChecked();
            await expect(aliasesCheckbox, 'aliases should be unchecked after none').not.toBeChecked();

            // Click "Wszystko" (select all)
            await optionsSection.getByRole('button', {name: 'Wszystko'}).click();
            await expect(triggersCheckbox, 'triggers should be checked after all').toBeChecked();
            await expect(aliasesCheckbox, 'aliases should be checked after all').toBeChecked();

            await closeExportImportModal(page);
        });

        test('individual option toggle works', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            const modal = await openExportImportModal(page);

            const scriptsCheckbox = modal.locator('#export-option-scripts');
            await expect(scriptsCheckbox, 'should be checked initially').toBeChecked();

            await scriptsCheckbox.uncheck();
            await expect(scriptsCheckbox, 'should be unchecked after click').not.toBeChecked();

            await scriptsCheckbox.check();
            await expect(scriptsCheckbox, 'should be checked after second click').toBeChecked();

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
            const successAlert = modal.locator('.alert-success');
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

            expect(payload.version, 'should have version 1').toBe(1);
            expect(payload.createdAt, 'should have createdAt timestamp').toBeDefined();
            expect(payload.localStorage, 'should have localStorage object').toBeDefined();
            expect(payload.localStorage.global, 'should have global localStorage').toBeDefined();
            expect(payload.localStorage.characters, 'should have characters localStorage').toBeDefined();
            expect(payload.indexedDB, 'should have indexedDB object').toBeDefined();
            expect(payload.indexedDB.multibinds, 'should have multibinds array').toBeInstanceOf(Array);
            expect(payload.indexedDB.visitedRooms, 'should have visitedRooms array').toBeInstanceOf(Array);

            await closeExportImportModal(page);
        });

        test('export respects character selection', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Setup two characters
            await page.evaluate(() => {
                localStorage.setItem('IncludeChar:settings', JSON.stringify({shortenExits: true}));
                localStorage.setItem('ExcludeChar:settings', JSON.stringify({shortenExits: false}));
            });

            const modal = await openExportImportModal(page);

            // Uncheck ExcludeChar
            const excludeCheckbox = modal.locator('#export-character-ExcludeChar');
            await excludeCheckbox.uncheck();

            const downloadPromise = page.waitForEvent('download');
            await modal.getByRole('button', {name: 'Eksportuj dane'}).click();

            const download: Download = await downloadPromise;
            const path = await download.path();
            const content = fs.readFileSync(path!, 'utf-8');
            const payload = JSON.parse(content);

            expect(payload.characters, 'should only include selected character').toContain('IncludeChar');
            expect(payload.characters, 'should not include deselected character').not.toContain('ExcludeChar');
            expect(payload.localStorage.characters['IncludeChar'], 'should have IncludeChar data').toBeDefined();
            expect(payload.localStorage.characters['ExcludeChar'], 'should not have ExcludeChar data').toBeUndefined();

            await closeExportImportModal(page);
        });
    });

    test.describe('Local import', () => {
        test('imports valid backup file and shows success message', async ({page}) => {
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
            await page.setInputFiles(`${EXPORT_IMPORT_MODAL} input[type="file"]`, {
                name: 'test-backup.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(validPayload)),
            });

            // Verify success message
            const successAlert = modal.locator('.alert-success');
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
            await page.setInputFiles(`${EXPORT_IMPORT_MODAL} input[type="file"]`, {
                name: 'invalid.json',
                mimeType: 'application/json',
                buffer: Buffer.from('not valid json'),
            });

            // Verify error message
            const errorAlert = modal.locator('.alert-danger');
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

            await page.setInputFiles(`${EXPORT_IMPORT_MODAL} input[type="file"]`, {
                name: 'wrong-version.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(invalidPayload)),
            });

            const errorAlert = modal.locator('.alert-danger');
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

            await page.setInputFiles(`${EXPORT_IMPORT_MODAL} input[type="file"]`, {
                name: 'incomplete.json',
                mimeType: 'application/json',
                buffer: Buffer.from(JSON.stringify(incompletePayload)),
            });

            const errorAlert = modal.locator('.alert-danger');
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
            await page.setInputFiles(`${EXPORT_IMPORT_MODAL} input[type="file"]`, {
                name: 'round-trip.json',
                mimeType: 'application/json',
                buffer: Buffer.from(exportedContent),
            });

            // Verify success
            const successAlert = modal.locator('.alert-success');
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

    test.describe('No characters scenario', () => {
        test('shows message when no characters are detected', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Clear any character-related data
            await page.evaluate(() => {
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.includes(':') && !key.startsWith('http')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
            });

            const modal = await openExportImportModal(page);

            // Should show "no characters" message
            await expect(modal, 'should show no characters message').toContainText('Brak zapisanych postaci');

            await closeExportImportModal(page);
        });
    });
});
