import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';
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
    await page.locator(`${SETTINGS_MODAL} .btn-close`).first().click();
    await expect(page.locator(SETTINGS_MODAL)).not.toBeVisible();
}

async function setLogging(page: Page, enabled: boolean): Promise<void> {
    const modal = await openSettings(page, 'ui-other');
    const toggle = modal.locator('#logs-enabled');
    await expect(modal.locator('label:has(#logs-enabled)')).toHaveText('Zapisuj logi');
    await toggle.setChecked(enabled);
    await expect(toggle).toBeChecked({checked: enabled});
    await closeSettings(page);
}

async function openLogs(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await page.waitForSelector('#logs-modal.show', {timeout: 5000});
    await expect(page.locator('.lv')).toBeVisible();
}

test.describe('Logging toggle', () => {
    test.beforeEach(async ({page}) => {
        await login(page);
    });

    test('the switch is in UI settings, not in the Logi browser', async ({page}) => {
        await openLogs(page);
        await expect(page.locator('#logs-modal #logs-enabled')).toHaveCount(0);
        await page.locator('#logs-close').click();
        await page.waitForSelector('#logs-modal.show', {state: 'hidden', timeout: 5000});

        const modal = await openSettings(page, 'ui-other');
        await expect(modal.locator('#logs-enabled')).toBeVisible();
    });

    test('lines are not stored while logging is off', async ({page}) => {
        await setLogging(page, false);
        await pushText(page, 'Linia gdy logi wylaczone');
        await setLogging(page, true);
        await pushText(page, 'Linia gdy logi wlaczone');

        await openLogs(page);
        const pane = page.locator('.lv-log');
        await expect(pane).toContainText('Linia gdy logi wlaczone');
        await expect(pane).not.toContainText('Linia gdy logi wylaczone');
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
