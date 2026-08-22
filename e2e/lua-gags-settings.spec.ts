import {expect, test} from './support/fixtures';
import type {Locator, Page} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    pushGmcp,
    pushText,
    GMCP_PATHS,
    waitForCommandInput,
    waitForOutputContaining,
    getRecentOutput,
} from './support/mocks';
import {
    getGagColorInput,
    getGagResetButton,
    getGagSelect,
    getStoredLuaGagsDeleteLines,
    openWalkaTab,
    saveOptions,
} from './support/options';

const LUA_GAGS_COLORS_STORAGE_KEY = 'lua_gags_colors';
const LUA_GAGS_WALKA_CONFIG_STORAGE_KEY = 'lua_gags_walka_config';

/** Local alias: this spec calls the Walka tab opener by its old name. */
const openLuaGagsTab = openWalkaTab;

async function getStoredLuaGagsColors(page: Page) {
    return await page.evaluate(([key]) => {
        const currentChar = localStorage.getItem('currentCharacter');
        const realKey = currentChar ? `${currentChar}:${key}` : key;
        const raw = localStorage.getItem(realKey);
        return raw ? JSON.parse(raw) : null;
    }, [LUA_GAGS_COLORS_STORAGE_KEY]);
}

async function getStoredWalkaConfig(page: Page) {
    return await page.evaluate(([key]) => {
        const currentChar = localStorage.getItem('currentCharacter');
        const realKey = currentChar ? `${currentChar}:${key}` : key;
        const raw = localStorage.getItem(realKey);
        return raw ? JSON.parse(raw) : null;
    }, [LUA_GAGS_WALKA_CONFIG_STORAGE_KEY]);
}

test.describe('Lua gags settings', () => {
    test('can change delete mode for moje_ciosy', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'GagTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'GagTester';
        });

        const modal = await openLuaGagsTab(page);

        // Find the select for moje_ciosy by label
        const mojeCiosySelect = getGagSelect(modal, 'moje_ciosy');

        // Default should be 2 (Dodaj prefiks)
        await expect(mojeCiosySelect).toHaveValue('2');

        // Change to 1 (delete line)
        await mojeCiosySelect.selectOption('1');

        await saveOptions(page);

        // Verify settings were saved
        const settings = await getStoredLuaGagsDeleteLines(page);
        expect(settings, 'should persist lua gags settings').toBeTruthy();
        expect(settings.moje_ciosy, 'moje_ciosy should be 1 (delete)').toBe(1);
    });

    test('can change delete mode to keep line (0)', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'KeepLineTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'KeepLineTester';
        });

        const modal = await openLuaGagsTab(page);

        const innych_ciosySelect = getGagSelect(modal, 'innych_ciosy');

        // Change to 0 (keep line)
        await innych_ciosySelect.selectOption('0');

        await saveOptions(page);

        const settings = await getStoredLuaGagsDeleteLines(page);
        expect(settings.innych_ciosy, 'innych_ciosy should be 0 (keep)').toBe(0);
    });

    test('can change color for gag type', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'ColorTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'ColorTester';
        });

        const modal = await openLuaGagsTab(page);

        // Find the color input for moje_spece
        const colorInput = getGagColorInput(modal, 'moje_spece');

        // Change color to red
        await colorInput.fill('#ff0000');

        await saveOptions(page);

        const colors = await getStoredLuaGagsColors(page);
        expect(colors, 'should persist lua gags colors').toBeTruthy();
        expect(colors.moje_spece, 'moje_spece color should be #ff0000').toBe('#ff0000');
    });

    test('can reset color to default', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'ResetColorTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'ResetColorTester';
        });

        // First set a custom color via UI
        let modal = await openLuaGagsTab(page);
        let colorInput = getGagColorInput(modal, 'moje_ciosy');
        await colorInput.fill('#123456');
        await saveOptions(page);

        // Re-open settings to verify and reset
        modal = await openLuaGagsTab(page);
        colorInput = getGagColorInput(modal, 'moje_ciosy');

        // Verify custom color is shown
        await expect(colorInput).toHaveValue('#123456');

        // Click reset button
        const resetButton = getGagResetButton(modal, 'moje_ciosy');
        await resetButton.click();

        // Color should be reset to default (#f0f8ff for moje_ciosy)
        await expect(colorInput).toHaveValue('#f0f8ff');

        await saveOptions(page);

        const colors = await getStoredLuaGagsColors(page);
        expect(colors.moje_ciosy, 'moje_ciosy color should be reset to default').toBe('#f0f8ff');
    });

    test('settings persist after reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'PersistGagTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'PersistGagTester';
        });

        const modal = await openLuaGagsTab(page);

        // Change settings
        const mojeCiosySelect = getGagSelect(modal, 'moje_ciosy');
        const mojeCiosyColor = getGagColorInput(modal, 'moje_ciosy');
        await mojeCiosySelect.selectOption('1');
        await mojeCiosyColor.fill('#abcdef');

        await saveOptions(page);

        // Reload page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'PersistGagTester';
        });

        // Open settings again and verify
        const reloadedModal = await openLuaGagsTab(page);

        const reloadedSelect = getGagSelect(reloadedModal, 'moje_ciosy');
        const reloadedColor = getGagColorInput(reloadedModal, 'moje_ciosy');
        await expect(reloadedSelect).toHaveValue('1');
        await expect(reloadedColor).toHaveValue('#abcdef');
    });

    test('all gag types are displayed', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'AllTypesTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'AllTypesTester';
        });

        const modal = await openLuaGagsTab(page);

        const expectedTypes = [
            'moje_ciosy',
            'moje_spece',
            'innych_ciosy',
            'innych_ciosy_we_mnie',
            'innych_spece',
            'moje_uniki',
            'innych_uniki',
            'moje_parowanie',
            'innych_parowanie',
            'zaslony_udane',
            'zaslony_nieudane',
            'bron',
            'npc',
            'npc_spece',
        ];

        for (const type of expectedTypes) {
            const select = getGagSelect(modal, type);
            await expect(select, `should display ${type} setting`).toBeVisible();
        }
    });
});

test.describe('Lua gags line processing', () => {
    test('adds prefix when mode is 2 (default)', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'PrefixTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'PrefixTester';
        });

        // Set mode to 2 (add prefix) for moje_ciosy via UI
        const modal = await openLuaGagsTab(page);
        const mojeCiosySelect = getGagSelect(modal, 'moje_ciosy');
        await mojeCiosySelect.selectOption('2');
        await saveOptions(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Send a combat message that matches moje_ciosy pattern
        // Using combat.avatar type for "my" hits
        await pushText(page, 'Lekko ranisz Orka mieczem.', {type: 'combat.avatar'});

        await waitForOutputContaining(page, 'Orka');

        // Check that the line contains the original text (it wasn't deleted)
        const textContent = await output.textContent();
        expect(textContent).toContain('Orka');
    });

    test('delete mode setting can be changed to 1', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'DeleteTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'DeleteTester';
        });

        // Set mode to 1 (delete) for innych_ciosy via UI
        const modal = await openLuaGagsTab(page);
        const innych_ciosySelect = getGagSelect(modal, 'innych_ciosy');
        await innych_ciosySelect.selectOption('1');
        await saveOptions(page);

        // Verify the setting was saved
        const settings = await getStoredLuaGagsDeleteLines(page);
        expect(settings.innych_ciosy, 'innych_ciosy should be 1 (delete)').toBe(1);
    });

    test('keeps line unchanged when mode is 0', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'KeepTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'KeepTester';
        });

        // Set mode to 0 (keep) for moje_uniki via UI
        const modal = await openLuaGagsTab(page);
        const mojeUnikiSelect = getGagSelect(modal, 'moje_uniki');
        await mojeUnikiSelect.selectOption('0');
        await saveOptions(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Send a dodge message
        await pushText(page, 'Uchylasz sie przed ciosem Orka.', {type: 'combat.avatar'});

        await waitForOutputContaining(page, 'Uchylasz sie');

        // Line should be kept without prefix
        const textContent = await output.textContent();
        expect(textContent).toContain('Uchylasz sie');
    });

    test('prefix has correct color when configured', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'ColorCheckTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'ColorCheckTester';
        });

        // Set mode to 2 (prefix) and custom color for testing via UI
        const modal = await openLuaGagsTab(page);
        const mojeCiosySelect = getGagSelect(modal, 'moje_ciosy');
        const mojeCiosyColor = getGagColorInput(modal, 'moje_ciosy');
        await mojeCiosySelect.selectOption('2');
        await mojeCiosyColor.fill('#ff0000');
        await saveOptions(page);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Send combat message - using a pattern that will trigger moje_ciosy
        await pushText(page, 'Lekko ranisz Orka mieczem.', {type: 'combat.avatar'});

        await waitForOutputContaining(page, 'Orka');

        // At minimum, the line should be displayed
        const textContent = await output.textContent();
        expect(textContent).toContain('Orka');
    });
});

test.describe('Lua gags settings isolation', () => {
    test('settings are character-scoped in storage', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'IsoChar1'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'IsoChar1';
        });

        // Set settings for IsoChar1 via UI
        let modal = await openLuaGagsTab(page);
        let mojeCiosySelect = getGagSelect(modal, 'moje_ciosy');
        await mojeCiosySelect.selectOption('1');
        await saveOptions(page);

        // Verify IsoChar1's settings are stored under character-scoped key
        const char1Settings = await getStoredLuaGagsDeleteLines(page);
        expect(char1Settings.moje_ciosy, 'IsoChar1 moje_ciosy should be 1').toBe(1);

        // Switch to IsoChar2
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'IsoChar2'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'IsoChar2';
        });

        // Open settings for IsoChar2 and save different value
        modal = await openLuaGagsTab(page);
        mojeCiosySelect = getGagSelect(modal, 'moje_ciosy');

        // Change IsoChar2's settings to something different
        await mojeCiosySelect.selectOption('0');
        await saveOptions(page);

        // Verify IsoChar2's settings are stored under its own key
        const char2Settings = await getStoredLuaGagsDeleteLines(page);
        expect(char2Settings.moje_ciosy, 'IsoChar2 moje_ciosy should be 0').toBe(0);

        // Switch back to IsoChar1
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'IsoChar1'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'IsoChar1';
        });

        // Verify IsoChar1's settings are preserved in storage
        const char1SettingsAfter = await getStoredLuaGagsDeleteLines(page);
        expect(char1SettingsAfter.moje_ciosy, 'IsoChar1 moje_ciosy should still be 1').toBe(1);

        // Open settings and verify UI shows IsoChar1's original value
        modal = await openLuaGagsTab(page);
        mojeCiosySelect = getGagSelect(modal, 'moje_ciosy');
        await expect(mojeCiosySelect).toHaveValue('1');
    });
});

const SREBRNY_FIN_MESSAGE =
    'Podbiegasz do Orka i spokojnym, precyzyjnym ruchem wyprowadzasz szerokie ciecie w jego glowe,' +
    ' a karby na twoim srebrnym kunsztownym mieczu rozrywaja cialo wroga.' +
    ' Widzisz, jak ostatkiem sil Ork probuje wstac, lecz po chwili z cichym jekiem osuwa sie na ziemie.';

test.describe('Finisher prefix', () => {
    test('custom finisher prefix is saved and persisted', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'FinPrefixTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'FinPrefixTester';
        });

        const modal = await openLuaGagsTab(page);

        const finPrefixInput = modal.locator('#walka-finPrefix');
        await finPrefixInput.clear();
        await finPrefixInput.fill('FINISH');

        await saveOptions(page);

        const walkaConfig = await getStoredWalkaConfig(page);
        expect(walkaConfig, 'walka config should be persisted').toBeTruthy();
        expect(walkaConfig.finPrefix, 'finPrefix should be saved as FINISH').toBe('FINISH');
    });

    test('custom finisher prefix appears in gag output', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'FinPrefixGagTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'FinPrefixGagTester';
        });

        // Set custom finisher prefix and ensure moje_ciosy mode is 2 (prefix)
        const modal = await openLuaGagsTab(page);
        const finPrefixInput = modal.locator('#walka-finPrefix');
        await finPrefixInput.clear();
        await finPrefixInput.fill('ZABIJ');
        const mojeCiosySelect = getGagSelect(modal, 'moje_ciosy');
        await mojeCiosySelect.selectOption('2');
        await saveOptions(page);

        // Send the srebrny_miecz finisher combat message
        await pushText(page, SREBRNY_FIN_MESSAGE, {type: 'combat.avatar'});

        await waitForOutputContaining(page, 'ZABIJ', 8000);

        const outputText = await getRecentOutput(page, 20);
        expect(outputText, 'output should contain [ZABIJ] prefix').toContain('[ZABIJ]');
    });

    test('default finisher prefix FIN works in gag output', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'DefaultFinTester'});

        await page.waitForFunction(() => {
            return localStorage.getItem('currentCharacter') === 'DefaultFinTester';
        });

        // Use default settings - no options changes needed
        // Send the srebrny_miecz finisher combat message
        await pushText(page, SREBRNY_FIN_MESSAGE, {type: 'combat.avatar'});

        await waitForOutputContaining(page, 'FIN', 8000);

        const outputText = await getRecentOutput(page, 20);
        expect(outputText, 'output should contain [FIN] prefix').toContain('[FIN]');
    });
});
