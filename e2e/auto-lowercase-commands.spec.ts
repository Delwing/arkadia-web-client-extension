import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    submitCommand,
    getLastOutgoingCommand,
    waitForCharacter,
    waitForCommandInput,
    pushGmcp,
    GMCP_PATHS,
} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';
const AUTO_LOWERCASE_CHECKBOX = '#ui-auto-lowercase-commands';

async function openUiSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    return modal;
}

async function setAutoLowercaseSetting(page: Page, enabled: boolean) {
    const modal = await openUiSettings(page);
    const checkbox = modal.locator(AUTO_LOWERCASE_CHECKBOX);

    if (enabled) {
        if (!(await checkbox.isChecked())) {
            await checkbox.check();
        }
    } else {
        if (await checkbox.isChecked()) {
            await checkbox.uncheck();
        }
    }

    await modal.locator('#ui-settings-save').click();
    await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();
}

test.describe('Auto lowercase commands', () => {
    test('should NOT lowercase commands when setting is OFF (default)', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Trigger receivedFirstGmcp by sending char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});
        await waitForCharacter(page, 'Tester');

        // Verify the setting is OFF by default and submit command without closing modal
        const storedSettings = await page.evaluate(() => {
            const keys = Object.keys(localStorage);
            const key = keys.find((item) => item === 'uiSettings' || item.endsWith(':uiSettings'));
            if (!key) return null;
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        });
        expect(storedSettings?.autoLowercaseCommands ?? false, 'should default to false').toBe(false);

        // Submit a command with uppercase letters
        await submitCommand(page, 'Patrz NA Polnoc');

        const command = await getLastOutgoingCommand(page);
        expect(command, 'should preserve original case when setting is OFF').toBe('Patrz NA Polnoc');
    });

    test('should lowercase commands when setting is ON', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Trigger receivedFirstGmcp by sending char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});

        // Enable auto lowercase
        await setAutoLowercaseSetting(page, true);

        // Verify the setting was saved to localStorage
        // autoLowercaseCommands is a render setting (renderSettings key).
        await page.waitForFunction(() => {
            try {
                const stored = localStorage.getItem('renderSettings');
                return stored ? JSON.parse(stored)?.autoLowercaseCommands === true : false;
            } catch {
                return false;
            }
        });

        // Submit a command with uppercase letters
        await submitCommand(page, 'Patrz NA Polnoc');

        const command = await getLastOutgoingCommand(page);
        expect(command, 'should lowercase command when setting is ON').toBe('patrz na polnoc');
    });

    test('should NOT lowercase commands starting with skip prefixes even when ON', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Trigger receivedFirstGmcp by sending char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});

        // Enable auto lowercase
        await setAutoLowercaseSetting(page, true);

        // Test with 'powiedz' prefix - should NOT lowercase
        await submitCommand(page, "powiedz Witaj Przygodo!");

        let command = await getLastOutgoingCommand(page);
        expect(command, 'should NOT lowercase after "powiedz" prefix').toBe("powiedz Witaj Przygodo!");

        // Test with single quote prefix - should NOT lowercase
        await submitCommand(page, "'Hej Tam!");

        command = await getLastOutgoingCommand(page);
        expect(command, 'should NOT lowercase after single quote prefix').toBe("'Hej Tam!");

        // Test with 'szepnij' prefix - should NOT lowercase
        await submitCommand(page, "szepnij Tajemnica Jest Bezpieczna");

        command = await getLastOutgoingCommand(page);
        expect(command, 'should NOT lowercase after "szepnij" prefix').toBe("szepnij Tajemnica Jest Bezpieczna");
    });

    test('should persist setting across reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Trigger receivedFirstGmcp by sending char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});

        // Enable auto lowercase and verify it's saved
        await setAutoLowercaseSetting(page, true);

        // autoLowercaseCommands is a render setting (renderSettings key).
        await page.waitForFunction(() => {
            try {
                const stored = localStorage.getItem('renderSettings');
                return stored ? JSON.parse(stored)?.autoLowercaseCommands === true : false;
            } catch {
                return false;
            }
        });

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Trigger receivedFirstGmcp again after reload
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});

        // Verify setting persisted after reload
        const reloadedSettings = await page.evaluate(() => {
            try {
                const raw = localStorage.getItem('renderSettings');
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        });
        expect(reloadedSettings?.autoLowercaseCommands, 'should remain true after reload').toBe(true);

        // Verify functionality still works
        await submitCommand(page, 'Rozejrzyj SIE');

        const command = await getLastOutgoingCommand(page);
        expect(command, 'should still lowercase commands after reload').toBe('rozejrzyj sie');
    });

    test('should update behavior when setting is changed', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Trigger receivedFirstGmcp by sending char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});

        // Start with setting OFF (default)
        await submitCommand(page, 'Badaj TEREN');

        let command = await getLastOutgoingCommand(page);
        expect(command, 'should preserve case when OFF').toBe('Badaj TEREN');

        // Enable the setting
        await setAutoLowercaseSetting(page, true);

        // Now it should lowercase
        await submitCommand(page, 'Badaj TEREN');

        command = await getLastOutgoingCommand(page);
        expect(command, 'should lowercase when ON').toBe('badaj teren');

        // Disable the setting again
        await setAutoLowercaseSetting(page, false);

        // Should preserve case again
        await submitCommand(page, 'Badaj TEREN');

        command = await getLastOutgoingCommand(page);
        expect(command, 'should preserve case when turned OFF again').toBe('Badaj TEREN');
    });

    test('should lowercase command text correctly', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Trigger receivedFirstGmcp by sending char.info
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});

        // Enable auto lowercase
        await setAutoLowercaseSetting(page, true);

        // Submit a command
        await submitCommand(page, 'Patrz NA Zachod');

        const command = await getLastOutgoingCommand(page);
        expect(command, 'should lowercase command text').toBe('patrz na zachod');
    });
});
