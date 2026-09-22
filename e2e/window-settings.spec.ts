import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    pushText,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

async function prepareClient(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await page.waitForFunction(() => localStorage.getItem('currentCharacter') === 'Tester');
}

async function openChat(page: Page): Promise<void> {
    await submitCommand(page, '/chatw');
    await page.locator('.chat-popup__messages').waitFor({state: 'visible'});
}

function fontSizePx(page: Page, selector: string): Promise<number> {
    return page.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
}

async function openChatSettings(page: Page) {
    await page.locator('.chat-popup .panel-button--settings').click();
    const panel = page.locator('.window-settings');
    await expect(panel).toBeVisible();
    return panel;
}

test.describe('Window settings cog', () => {
    test('overrides the chat font size for that window only, and resets it', async ({page}) => {
        await prepareClient(page);
        await openChat(page);

        const mainOutput = '#main_text_output_msg_wrapper';
        const chatMessages = '.chat-popup__messages';
        const mainBefore = await fontSizePx(page, mainOutput);
        const chatBefore = await fontSizePx(page, chatMessages);

        const panel = await openChatSettings(page);
        await expect(panel.locator('.window-settings__size-value')).toHaveText('Jak okno glowne');
        for (let i = 0; i < 4; i++) {
            await panel.getByTitle('Wieksza czcionka').click();
        }

        await expect.poll(() => fontSizePx(page, chatMessages)).toBeGreaterThan(chatBefore);
        expect(await fontSizePx(page, mainOutput), 'main window keeps its size').toBe(mainBefore);

        await panel.locator('.window-settings__reset').click();
        await expect.poll(() => fontSizePx(page, chatMessages)).toBe(chatBefore);
        await expect(panel.locator('.window-settings__size-value')).toHaveText('Jak okno glowne');
    });

    test('chat options moved into the cog still drive the window', async ({page}) => {
        await prepareClient(page);
        await openChat(page);
        await pushText(page, 'Ktos mowi: czesc', {type: 'comm'});
        await expect(page.locator('.chat-popup__timestamp').first()).toBeVisible();

        const panel = await openChatSettings(page);
        await expect(panel.getByText('Czat', {exact: true})).toBeVisible();
        await panel.locator('.window-settings__toggle', {hasText: 'Znacznik czasu'}).click();
        await expect(page.locator('.chat-popup__timestamp')).toHaveCount(0);

        await panel.locator('.window-settings__toggle', {hasText: 'Zawijaj wiersze'}).click();
        await expect(page.locator('.chat-popup__messages')).toHaveClass(/chat-popup__messages--no-wrap/);

        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
    });

    test('map options live in the map cog, not in its menu', async ({page}) => {
        await prepareClient(page);
        await waitForMapReady(page);
        await openSettings(page, 'ui-windows');
        const layoutToggle = page.locator('#ui-layout-manager-enabled');
        if (!(await layoutToggle.isChecked())) await layoutToggle.click();
        await saveSettings(page);
        await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));

        const mapPanel = page.locator('.docked-panel--map');
        await mapPanel.getByTitle('Menu mapy').click();
        const menu = page.locator('.popup-menu');
        await expect(menu.getByText('Planer trasy')).toBeVisible();
        await expect(menu.getByText('Siatka')).toHaveCount(0);
        await page.keyboard.press('Escape');

        await mapPanel.locator('.panel-button--settings').click();
        const panel = page.locator('.window-settings');
        await expect(panel.getByText('Wyglad', {exact: true})).toHaveCount(0);
        await expect(panel.locator('.window-settings__toggle', {hasText: 'Siatka'})).toBeVisible();

        const locationBar = page.locator('#location-wrapper');
        await expect(locationBar).toBeVisible();
        await panel.locator('.window-settings__toggle', {hasText: 'Etykieta w naglowku'}).click();
        await expect(locationBar).toBeHidden();
        await panel.locator('.window-settings__toggle', {hasText: 'Etykieta w naglowku'}).click();
        await expect(locationBar).toBeVisible();
    });

    test('locking the interface keeps the settings cog usable', async ({page}) => {
        await prepareClient(page);
        await waitForMapReady(page);
        await openSettings(page, 'ui-windows');
        const layoutToggle = page.locator('#ui-layout-manager-enabled');
        if (!(await layoutToggle.isChecked())) await layoutToggle.click();
        await saveSettings(page);
        await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));

        await submitCommand(page, '/blokada');
        await page.waitForFunction(() => document.body.classList.contains('layout-locked'));

        const mapPanel = page.locator('.docked-panel--map');
        await expect(mapPanel.locator('.panel-button--popout'), 'placement controls hide').toBeHidden();
        const cog = mapPanel.locator('.panel-button--settings');
        await expect(cog, 'the cog stays').toBeVisible();
        await cog.click();
        await page.locator('.window-settings .window-settings__toggle', {hasText: 'Siatka'}).click();
        await expect(page.locator('.window-settings .window-settings__toggle', {hasText: 'Siatka'})).toHaveClass(/\bis-on\b/);
    });
});
