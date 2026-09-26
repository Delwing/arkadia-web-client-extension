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

/** Title and close button share the top row; the popup's own actions go below. */
async function expectStackedHeader(page: Page, selector: string): Promise<void> {
    const panel = page.locator(`.floating-panel:is(${selector}), .floating-panel:has(${selector})`).first();
    const header = panel.locator('.managed-panel__header');
    await expect(header).toHaveClass(/managed-panel__header--stacked/);
    const title = await header.locator('.managed-panel__title').boundingBox();
    const close = await header.locator('.panel-button--close').boundingBox();
    const custom = await header.locator('.managed-panel__custom-actions > *').first().boundingBox();
    if (!title || !close || !custom) throw new Error('header parts have no box');
    expect(Math.abs((close.y + close.height / 2) - (title.y + title.height / 2))).toBeLessThan(4);
    expect(custom.y).toBeGreaterThanOrEqual(close.y + close.height);
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
        await expectStackedHeader(page, '.package-receiver');
    });

    test('a wide popup keeps its header on one row', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 900});
        await openFromMenu(page, 'npc-button');
        const header = page.locator('.floating-panel.package-receiver .managed-panel__header');
        await expect(header).toBeVisible();
        await expect(header).not.toHaveClass(/managed-panel__header--stacked/);
        await page.setViewportSize(PHONE);
        await expect(header).toHaveClass(/managed-panel__header--stacked/);
        await page.setViewportSize({width: 1280, height: 900});
        await expect(header).not.toHaveClass(/managed-panel__header--stacked/);
    });

    test('a popup stays on screen after the screen shrinks', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 900});
        await openFromMenu(page, 'people-browser-button');
        await page.setViewportSize(PHONE);
        await expectPanelOnScreen(page, '.people-browser');
    });
});
