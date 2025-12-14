import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    pushGmcp,
    GMCP_PATHS,
    waitForCommandInput,
} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const OPTIONS_BUTTON = '#options-button';
const OPTIONS_MODAL = '#options-modal';
const OPTIONS_SAVE_BUTTON = '#options-save';

async function openOptions(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(OPTIONS_BUTTON);
    const modal = page.locator(OPTIONS_MODAL);
    await expect(modal, 'should open options modal').toBeVisible();
    return modal;
}

async function saveOptions(page: Page) {
    await page.click(OPTIONS_SAVE_BUTTON);
    const modal = page.locator(OPTIONS_MODAL);
    await expect(modal, 'should close options modal after saving').not.toBeVisible();
}

async function getStoredSettings(page: Page, character: string) {
    return await page.evaluate(([char]) => {
        const key = `${char}:settings`;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }, [character]);
}

test.describe('Character settings', () => {
    test('settings take effect for current character', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'TestHero'});

        // Wait for character to be set
        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'TestHero';
        });

        const modal = await openOptions(page);

        // Change some settings
        const shortenExitsCheckbox = modal.locator('#shortenExits');
        await shortenExitsCheckbox.check();

        // Find collect mode select by ID
        const collectModeSelect = modal.locator('#collectMode');
        await collectModeSelect.selectOption('3'); // leader mode

        const lowHpAlertSelect = modal.locator('#lowHpAlert');
        await lowHpAlertSelect.selectOption('5');

        await saveOptions(page);

        // Verify settings were saved to storage
        const settings = await getStoredSettings(page, 'TestHero');
        expect(settings, 'should persist settings for TestHero').toBeTruthy();
        expect(settings.shortenExits, 'shortenExits should be enabled').toBe(true);
        expect(settings.collectMode, 'collectMode should be 3').toBe(3);
        expect(settings.lowHpAlert, 'lowHpAlert should be 5').toBe(5);
    });

    test('settings persist after reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'PersistHero'});

        // Wait for character to be set
        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'PersistHero';
        });

        const modal = await openOptions(page);

        // Change settings
        const packageHelperCheckbox = modal.locator('#packageHelper');
        await packageHelperCheckbox.uncheck();

        const prettyContainersCheckbox = modal.locator('#prettyContainers');
        await prettyContainersCheckbox.uncheck();

        // Find language select by text content (it contains language options like 'potoczna', 'bretonski')
        // Use first() to get the main language select (not the alias one)
        const languageSelect = modal.locator('select').filter({hasText: 'potoczna'}).first();
        await languageSelect.selectOption('bretonski');

        await saveOptions(page);

        // Verify settings were saved
        let settings = await getStoredSettings(page, 'PersistHero');
        expect(settings.packageHelper, 'packageHelper should be disabled before reload').toBe(false);
        expect(settings.prettyContainers, 'prettyContainers should be disabled before reload').toBe(false);
        expect(settings.language, 'language should be bretonski before reload').toBe('bretonski');

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Wait for character to be restored
        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'PersistHero';
        });

        // Verify settings persisted after reload
        settings = await getStoredSettings(page, 'PersistHero');
        expect(settings.packageHelper, 'packageHelper should be disabled after reload').toBe(false);
        expect(settings.prettyContainers, 'prettyContainers should be disabled after reload').toBe(false);
        expect(settings.language, 'language should be bretonski after reload').toBe('bretonski');

        // Open options and verify UI reflects persisted settings
        const reloadedModal = await openOptions(page);
        await expect(
            reloadedModal.locator('#packageHelper'),
            'packageHelper checkbox should be unchecked'
        ).not.toBeChecked();
        await expect(
            reloadedModal.locator('#prettyContainers'),
            'prettyContainers checkbox should be unchecked'
        ).not.toBeChecked();
        await expect(
            reloadedModal.locator('select').filter({hasText: 'potoczna'}).first(),
            'language select should show bretonski'
        ).toHaveValue('bretonski');
    });

    test('settings change on character switch via gmcp.char.info', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'FirstChar'});

        // Wait for first character to be set
        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'FirstChar';
        });

        // Set settings for FirstChar
        let modal = await openOptions(page);
        await modal.locator('#shortenExits').check();
        await modal.locator('#collectMode').selectOption('2'); // own loot
        await modal.locator('#lowHpAlert').selectOption('3');
        await saveOptions(page);

        // Verify settings for FirstChar
        const settings = await getStoredSettings(page, 'FirstChar');
        expect(settings.shortenExits, 'FirstChar shortenExits should be true').toBe(true);
        expect(settings.collectMode, 'FirstChar collectMode should be 2').toBe(2);
        expect(settings.lowHpAlert, 'FirstChar lowHpAlert should be 3').toBe(3);

        // Manually set different settings for SecondChar in storage
        await page.evaluate(() => {
            localStorage.setItem('SecondChar:settings', JSON.stringify({
                packageHelper: true,
                inlineCompassRose: false,
                shortenExits: false,
                prettyContainers: true,
                containerColumns: 2,
                collectMode: 4, // nothing
                collectCopper: true,
                collectSilver: true,
                collectGold: true,
                collectGems: true,
                collectExtra: [],
                language: 'estalijski',
                languageAdjective: '',
                languageAliases: [],
                herbPreUseCommand: '',
                herbPostUseCommand: '',
                attackCommand: 'zabij',
                drawWeaponCommand: 'dobadz',
                fullHpMessage: false,
                lowHpAlert: 7,
                letterLineWidth: 72,
            }));
        });

        // Simulate character switch via gmcp.char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'SecondChar'});

        // Wait for character to change
        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'SecondChar';
        });

        // Give it a moment for the settings change event to propagate
        await page.waitForTimeout(100);

        // Verify active settings changed to SecondChar's settings
        const currentSettings = await page.evaluate(() => {
            const key = 'SecondChar:settings';
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        });

        expect(currentSettings.shortenExits, 'SecondChar shortenExits should be false').toBe(false);
        expect(currentSettings.collectMode, 'SecondChar collectMode should be 4').toBe(4);
        expect(currentSettings.lowHpAlert, 'SecondChar lowHpAlert should be 7').toBe(7);
        expect(currentSettings.language, 'SecondChar language should be estalijski').toBe('estalijski');

        // Open options and verify UI shows SecondChar's settings
        modal = await openOptions(page);

        // Wait for the alert to show the character name (formatted with first letter uppercase, rest lowercase)
        const characterAlert = modal.locator('.alert-info');
        await expect(characterAlert).toContainText('Secondchar');

        // Verify the UI reflects SecondChar's settings
        await expect(
            modal.locator('#shortenExits'),
            'shortenExits checkbox should be unchecked for SecondChar'
        ).not.toBeChecked();
        await expect(
            modal.locator('#collectMode'),
            'collectMode select should show 4 for SecondChar'
        ).toHaveValue('4');
        await expect(
            modal.locator('#lowHpAlert'),
            'lowHpAlert input should show 7 for SecondChar'
        ).toHaveValue('7');
        await expect(
            modal.locator('select').filter({hasText: 'potoczna'}).first(),
            'language select should show estalijski for SecondChar'
        ).toHaveValue('estalijski');

        // Close modal by clicking save (no changes made, so it just closes)
        await modal.locator('#options-save').click();
        await expect(modal, 'should close options modal after save').not.toBeVisible();

        // Switch back to FirstChar
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'FirstChar'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'FirstChar';
        });

        // Wait for settings to propagate
        await page.waitForTimeout(100);

        // Verify settings switched back to FirstChar (formatted with first letter uppercase, rest lowercase)
        modal = await openOptions(page);
        await expect(
            modal.locator('.alert-info'),
            'should show Firstchar in alert'
        ).toContainText('Firstchar');
        await expect(
            modal.locator('#shortenExits'),
            'shortenExits should be checked for FirstChar'
        ).toBeChecked();
        await expect(
            modal.locator('#collectMode'),
            'collectMode should be 2 for FirstChar'
        ).toHaveValue('2');
        await expect(
            modal.locator('#lowHpAlert'),
            'lowHpAlert should be 3 for FirstChar'
        ).toHaveValue('3');
    });

    test('settings are isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'AliceChar'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'AliceChar';
        });

        // Set settings for AliceChar
        let modal = await openOptions(page);
        await modal.locator('#containerColumns').fill('3');
        await modal.locator('#letterLineWidth').fill('80');
        await saveOptions(page);

        const aliceSettings = await getStoredSettings(page, 'AliceChar');
        expect(aliceSettings.containerColumns, 'AliceChar containerColumns should be 3').toBe(3);
        expect(aliceSettings.letterLineWidth, 'AliceChar letterLineWidth should be 80').toBe(80);

        // Switch to BobChar
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'BobChar'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'BobChar';
        });

        // Set different settings for BobChar
        modal = await openOptions(page);
        await modal.locator('#containerColumns').fill('4');
        await modal.locator('#letterLineWidth').fill('60');
        await saveOptions(page);

        const bobSettings = await getStoredSettings(page, 'BobChar');
        expect(bobSettings.containerColumns, 'BobChar containerColumns should be 4').toBe(4);
        expect(bobSettings.letterLineWidth, 'BobChar letterLineWidth should be 60').toBe(60);

        // Verify AliceChar settings are unchanged
        const aliceSettingsAfter = await getStoredSettings(page, 'AliceChar');
        expect(aliceSettingsAfter.containerColumns, 'AliceChar containerColumns should still be 3').toBe(3);
        expect(aliceSettingsAfter.letterLineWidth, 'AliceChar letterLineWidth should still be 80').toBe(80);

        // Switch back to AliceChar and verify settings
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'AliceChar'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'AliceChar';
        });

        await page.waitForTimeout(100);

        modal = await openOptions(page);
        await expect(
            modal.locator('#containerColumns'),
            'AliceChar containerColumns should be 3 in UI'
        ).toHaveValue('3');
        await expect(
            modal.locator('#letterLineWidth'),
            'AliceChar letterLineWidth should be 80 in UI'
        ).toHaveValue('80');
    });
});
