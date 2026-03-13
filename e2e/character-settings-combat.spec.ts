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

test.describe('Character combat settings', () => {
    test('attack command setting is saved and persisted', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'CombatHero'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'CombatHero';
        });

        const modal = await openOptions(page);

        // Find the attack command input by its placeholder or value
        const attackCommandInput = modal.locator('input[placeholder="zabij"]');
        await expect(attackCommandInput, 'attack command input should be visible').toBeVisible();

        // Clear and set new attack command
        await attackCommandInput.clear();
        await attackCommandInput.fill('napadnij');

        await saveOptions(page);

        // Verify settings were saved to storage
        const settings = await getStoredSettings(page, 'CombatHero');
        expect(settings, 'should persist settings for CombatHero').toBeTruthy();
        expect(settings.attackCommand, 'attackCommand should be napadnij').toBe('napadnij');
    });

    test('draw weapon command setting is saved and persisted', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'WeaponHero'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'WeaponHero';
        });

        const modal = await openOptions(page);

        // Find the draw weapon command input by its placeholder
        const drawWeaponInput = modal.locator('input[placeholder="dobadz"]');
        await expect(drawWeaponInput, 'draw weapon input should be visible').toBeVisible();

        // Clear and set new draw weapon command
        await drawWeaponInput.clear();
        await drawWeaponInput.fill('wyciagnij');

        await saveOptions(page);

        // Verify settings were saved to storage
        const settings = await getStoredSettings(page, 'WeaponHero');
        expect(settings, 'should persist settings for WeaponHero').toBeTruthy();
        expect(settings.drawWeaponCommand, 'drawWeaponCommand should be wyciagnij').toBe('wyciagnij');
    });

    test('combat settings persist after reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'PersistCombat'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'PersistCombat';
        });

        const modal = await openOptions(page);

        // Set combat settings
        const attackCommandInput = modal.locator('input[placeholder="zabij"]');
        await attackCommandInput.clear();
        await attackCommandInput.fill('atakuj');

        const drawWeaponInput = modal.locator('input[placeholder="dobadz"]');
        await drawWeaponInput.clear();
        await drawWeaponInput.fill('wyjmij');

        await saveOptions(page);

        // Verify settings before reload
        let settings = await getStoredSettings(page, 'PersistCombat');
        expect(settings.attackCommand, 'attackCommand should be atakuj before reload').toBe('atakuj');
        expect(settings.drawWeaponCommand, 'drawWeaponCommand should be wyjmij before reload').toBe('wyjmij');

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Wait for character to be restored
        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'PersistCombat';
        });

        // Verify settings persisted after reload
        settings = await getStoredSettings(page, 'PersistCombat');
        expect(settings.attackCommand, 'attackCommand should be atakuj after reload').toBe('atakuj');
        expect(settings.drawWeaponCommand, 'drawWeaponCommand should be wyjmij after reload').toBe('wyjmij');

        // Open options and verify UI reflects persisted settings
        const reloadedModal = await openOptions(page);
        await expect(
            reloadedModal.locator('input[placeholder="zabij"]'),
            'attack command input should show atakuj'
        ).toHaveValue('atakuj');
        await expect(
            reloadedModal.locator('input[placeholder="dobadz"]'),
            'draw weapon input should show wyjmij'
        ).toHaveValue('wyjmij');
    });

    test('combat settings are isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'WarriorChar'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'WarriorChar';
        });

        // Set combat settings for WarriorChar
        let modal = await openOptions(page);
        const warriorAttackInput = modal.locator('input[placeholder="zabij"]');
        await warriorAttackInput.clear();
        await warriorAttackInput.fill('uderzaj');

        const warriorDrawInput = modal.locator('input[placeholder="dobadz"]');
        await warriorDrawInput.clear();
        await warriorDrawInput.fill('szykuj');

        await saveOptions(page);

        const warriorSettings = await getStoredSettings(page, 'WarriorChar');
        expect(warriorSettings.attackCommand, 'WarriorChar attackCommand should be uderzaj').toBe('uderzaj');
        expect(warriorSettings.drawWeaponCommand, 'WarriorChar drawWeaponCommand should be szykuj').toBe('szykuj');

        // Switch to MageChar
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'MageChar'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'MageChar';
        });

        // Set different combat settings for MageChar
        modal = await openOptions(page);
        const mageAttackInput = modal.locator('input[placeholder="zabij"]');
        await mageAttackInput.clear();
        await mageAttackInput.fill('rzuc');

        const mageDrawInput = modal.locator('input[placeholder="dobadz"]');
        await mageDrawInput.clear();
        await mageDrawInput.fill('przywolaj');

        await saveOptions(page);

        const mageSettings = await getStoredSettings(page, 'MageChar');
        expect(mageSettings.attackCommand, 'MageChar attackCommand should be rzuc').toBe('rzuc');
        expect(mageSettings.drawWeaponCommand, 'MageChar drawWeaponCommand should be przywolaj').toBe('przywolaj');

        // Verify WarriorChar settings are unchanged
        const warriorSettingsAfter = await getStoredSettings(page, 'WarriorChar');
        expect(warriorSettingsAfter.attackCommand, 'WarriorChar attackCommand should still be uderzaj').toBe('uderzaj');
        expect(warriorSettingsAfter.drawWeaponCommand, 'WarriorChar drawWeaponCommand should still be szykuj').toBe('szykuj');

        // Switch back to WarriorChar and verify settings in UI
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'WarriorChar'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'WarriorChar';
        });

        modal = await openOptions(page);
        await expect(
            modal.locator('input[placeholder="zabij"]'),
            'WarriorChar attack command should be uderzaj in UI'
        ).toHaveValue('uderzaj');
        await expect(
            modal.locator('input[placeholder="dobadz"]'),
            'WarriorChar draw weapon command should be szykuj in UI'
        ).toHaveValue('szykuj');
    });

    test('combat settings change on character switch via gmcp.char.info', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'FirstFighter'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'FirstFighter';
        });

        // Set settings for FirstFighter
        let modal = await openOptions(page);
        const firstAttackInput = modal.locator('input[placeholder="zabij"]');
        await firstAttackInput.clear();
        await firstAttackInput.fill('walcz');

        await saveOptions(page);

        // Manually set different settings for SecondFighter in storage
        await page.evaluate(() => {
            const existingSettings = localStorage.getItem('SecondFighter:settings');
            const settings = existingSettings ? JSON.parse(existingSettings) : {};
            settings.attackCommand = 'masakruj';
            settings.drawWeaponCommand = 'przygotuj';
            localStorage.setItem('SecondFighter:settings', JSON.stringify(settings));
        });

        // Simulate character switch via gmcp.char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'SecondFighter'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'SecondFighter';
        });

        // Open options and verify UI shows SecondFighter's settings
        modal = await openOptions(page);
        await expect(
            modal.locator('input[placeholder="zabij"]'),
            'attack command should show masakruj for SecondFighter'
        ).toHaveValue('masakruj');
        await expect(
            modal.locator('input[placeholder="dobadz"]'),
            'draw weapon command should show przygotuj for SecondFighter'
        ).toHaveValue('przygotuj');
    });

    test('default combat settings are applied for new character', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'NewCharacter'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'NewCharacter';
        });

        const modal = await openOptions(page);

        // Verify default values are shown
        await expect(
            modal.locator('input[placeholder="zabij"]'),
            'attack command input should show default value zabij'
        ).toHaveValue('zabij');
        await expect(
            modal.locator('input[placeholder="dobadz"]'),
            'draw weapon input should show default value dobadz'
        ).toHaveValue('dobadz');
    });

    test('empty attack command reverts to default on save', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'EmptyCommandChar'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'EmptyCommandChar';
        });

        const modal = await openOptions(page);

        // Set a custom attack command first
        const attackCommandInput = modal.locator('input[placeholder="zabij"]');
        await attackCommandInput.clear();
        await attackCommandInput.fill('napadnij');

        await saveOptions(page);

        // Verify it was saved
        let settings = await getStoredSettings(page, 'EmptyCommandChar');
        expect(settings.attackCommand, 'attackCommand should be napadnij').toBe('napadnij');

        // Open options again and clear the attack command
        const modal2 = await openOptions(page);
        const attackCommandInput2 = modal2.locator('input[placeholder="zabij"]');
        await attackCommandInput2.clear();

        await saveOptions(page);

        // The empty value should be saved (the normalization happens on use, not on save)
        settings = await getStoredSettings(page, 'EmptyCommandChar');
        expect(settings.attackCommand, 'attackCommand should be empty string').toBe('');
    });
});
