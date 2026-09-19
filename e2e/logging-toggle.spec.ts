import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';
import {dialogClose} from './support/dialogs';
import {openSettings, SETTINGS_MODAL} from './support/settings';
import type {Page} from '@playwright/test';

// The "Zapisuj logi" / "Zapisuj na dysk" switches live on Interfejs > Inne,
// not in the Logi browser, and apply on click (no Save needed).

async function login(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
    await waitForCharacter(page, 'TestChar');
}

async function closeSettings(page: Page): Promise<void> {
    await dialogClose(page.locator(SETTINGS_MODAL)).first().click();
    await expect(page.locator(SETTINGS_MODAL)).not.toBeVisible();
}

async function setLogging(page: Page, enabled: boolean): Promise<void> {
    const modal = await openSettings(page, 'ui-other');
    const toggle = modal.locator('#logs-enabled');
    await expect(modal.locator('label[for="logs-enabled"]')).toHaveText('Zapisuj logi');
    await toggle.setChecked(enabled);
    await expect(toggle).toBeChecked({checked: enabled});
    await closeSettings(page);
}

const LOGS_DIALOG = '.logs-dialog';

async function openLogs(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await expect(page.locator(LOGS_DIALOG), 'logs window should open').toBeVisible({timeout: 5000});
    await expect(page.locator('.lv-log'), 'the log pane should render').toBeVisible({timeout: 5000});
}

test.describe('Logging toggle', () => {
    test.beforeEach(async ({page}) => {
        await login(page);
    });

    test('the switch is in UI settings, not in the Logi browser', async ({page}) => {
        await openLogs(page);
        await expect(page.locator(`${LOGS_DIALOG} #logs-enabled`)).toHaveCount(0);
        await dialogClose(page.locator(LOGS_DIALOG)).click();
        await expect(page.locator(LOGS_DIALOG), 'logs window should close').not.toBeVisible({timeout: 5000});

        const modal = await openSettings(page, 'ui-other');
        await expect(modal.locator('#logs-enabled')).toBeVisible();
    });

    test('lines are not stored while logging is off', async ({page}) => {
        await setLogging(page, false);
        await pushText(page, 'Linia gdy logi wylaczone');
        await setLogging(page, true);
        await pushText(page, 'Linia gdy logi wlaczone');

        await openLogs(page);
        const preview = page.locator('.lv-log');
        await expect(preview).toContainText('Linia gdy logi wlaczone');
        await expect(preview).not.toContainText('Linia gdy logi wylaczone');
    });

    test('the setting persists after page reload', async ({page}) => {
        await setLogging(page, false);

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openSettings(page, 'ui-other');
        await expect(modal.locator('#logs-enabled')).not.toBeChecked();
    });
});
