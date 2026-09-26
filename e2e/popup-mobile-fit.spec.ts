import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';

/**
 * Popups open with desktop sizes (Baza postaci is 550px wide). On a phone the
 * floating panel must be fitted to the screen so its titlebar - and the close
 * button in it - stays reachable.
 */

const PHONE = {width: 390, height: 700};

async function openFromMenu(page: Page, buttonId: string): Promise<void> {
    await page.click('#menu-button');
    await page.click(`#${buttonId}`);
}

async function expectPanelOnScreen(page: Page, selector: string): Promise<void> {
    const panel = page.locator(`.floating-panel:is(${selector}), .floating-panel:has(${selector})`).first();
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    if (!box) throw new Error('panel has no box');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);

    const close = panel.locator('.panel-button--close');
    const closeBox = await close.boundingBox();
    if (!closeBox) throw new Error('close button has no box');
    expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(PHONE.width);
}

test.describe('Popups on a phone screen', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize(PHONE);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('Baza postaci fits the screen', async ({page}) => {
        await openFromMenu(page, 'people-browser-button');
        await expectPanelOnScreen(page, '.people-browser');
    });

    test('Odbiorcy paczek fits the screen', async ({page}) => {
        await openFromMenu(page, 'npc-button');
        await expectPanelOnScreen(page, '.package-receiver');
    });

    test('a popup stays on screen after the screen shrinks', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 900});
        await openFromMenu(page, 'people-browser-button');
        await page.setViewportSize(PHONE);
        await expectPanelOnScreen(page, '.people-browser');
    });
});
