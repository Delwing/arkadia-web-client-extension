import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, installEmbeddedMock, waitForCommandInput} from './support/mocks';

/**
 * Each footer row has its own size setting (Ustawienia -> Stopka -> Rozmiar
 * stopki): the bind row and the status line grow independently.
 */

async function seedScales(page: Page, scales: {footerBindsScale?: number; footerStatusScale?: number}): Promise<void> {
    await page.addInitScript((patch) => {
        const raw = localStorage.getItem('uiSettings');
        const settings = raw ? JSON.parse(raw) : {};
        localStorage.setItem('uiSettings', JSON.stringify({...settings, ...patch}));
    }, scales);
}

async function statusHeight(page: Page): Promise<number> {
    return page.locator('#char-state').evaluate((el) => el.getBoundingClientRect().height);
}

test.beforeEach(async ({context}) => {
    await installEmbeddedMock(context);
});

test.describe('Footer row scale', () => {
    test('the status line grows with its scale, the bind row keeps its own', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        const base = await statusHeight(page);

        await seedScales(page, {footerStatusScale: 1.5});
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await expect.poll(() => statusHeight(page)).toBeGreaterThan(base * 1.4);
        const zooms = await page.evaluate(() => ({
            binds: getComputedStyle(document.getElementById('multi-binds')!).zoom,
            status: getComputedStyle(document.getElementById('char-state')!).zoom,
        }));
        expect(zooms).toEqual({binds: '1', status: '1.5'});
    });
});
