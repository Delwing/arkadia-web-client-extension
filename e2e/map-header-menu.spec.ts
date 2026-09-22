import {expect, test} from './support/fixtures';
import {ensureGameSocket, primeCharInfo, waitForCommandInput, waitForMapReady} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';
import type {Page} from '@playwright/test';

const zOf = (page: Page, id: string) =>
    page.locator(`[data-window-id="${id}"]`).evaluate((el) => Number(getComputedStyle(el).zIndex));

test('map menu: an open window asked for again comes to the front', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await page.waitForFunction(() => localStorage.getItem('currentCharacter') === 'Tester');
    await waitForMapReady(page);
    await openSettings(page, 'ui-windows');
    const layoutToggle = page.locator('#ui-layout-manager-enabled');
    if (!(await layoutToggle.isChecked())) await layoutToggle.click();
    await saveSettings(page);
    await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));

    const mapMenu = async (item: string) => {
        await page.locator('.docked-panel--map').getByTitle('Menu mapy').click();
        await page.locator('.popup-menu').getByText(item).click();
    };
    await mapMenu('Skroty');
    await expect(page.locator('[data-window-id="popup:skroty"]')).toBeVisible();
    // Pinned, so opening the next one does not close it.
    await page.locator('[data-window-id="popup:skroty"] .panel-button--pin').click();
    await mapMenu('Planer trasy');
    await expect(page.locator('[data-window-id="popup:tripPlanner"]')).toBeVisible();
    expect(await zOf(page, 'popup:tripPlanner')).toBeGreaterThan(await zOf(page, 'popup:skroty'));

    await mapMenu('Skroty');
    await expect.poll(async () => (await zOf(page, 'popup:skroty')) > (await zOf(page, 'popup:tripPlanner'))).toBe(true);
});
