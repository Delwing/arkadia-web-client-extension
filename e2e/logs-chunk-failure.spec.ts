import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

// The Logi browser is a lazily loaded chunk. A page left open across a deploy
// asks for a chunk the deploy removed, which is what aborting it here stands
// for. The chunk is fetched in the background a little after startup, so only
// a deploy inside that window can still break it; when it does, the window
// must say so and stay closable (its close control otherwise lives in the
// browser that failed).

const LOG_BROWSER_CHUNK = /LogBrowser[^/]*\.(js|tsx|css)(\?|$)/;

async function openLogs(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await expect(page.locator('#logs-modal')).toBeVisible();
}

test('Logi explains a chunk that failed to load and stays closable', async ({page}) => {
    await page.route(LOG_BROWSER_CHUNK, route => route.abort());

    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    await openLogs(page);
    const failed = page.locator('#logs-modal .logs-failed');
    await expect(failed).toContainText('Nie udało się wczytać okna logów.');
    await expect(failed.getByRole('button', {name: 'Odśwież'})).toBeVisible();

    await failed.locator('.logs-failed__close').click();
    await expect(page.locator('#logs-modal')).toBeHidden();

    // Opened again, it explains again rather than staying empty.
    await openLogs(page);
    await expect(page.locator('#logs-modal .logs-failed')).toContainText('Nie udało się wczytać okna logów.');
});

test('Logi still opens after a deploy once its chunk was preloaded', async ({page}) => {
    await page.clock.install();
    const preloaded = page.waitForResponse(response => LOG_BROWSER_CHUNK.test(response.url()) && response.ok());

    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    // Past the preload delay, without opening the window.
    await page.clock.runFor(25_000);
    await preloaded;

    // The deploy: the chunk is gone from the server.
    await page.route(LOG_BROWSER_CHUNK, route => route.abort());

    await openLogs(page);
    await expect(page.locator('#logs-modal .lv')).toBeVisible();
    await expect(page.locator('#logs-modal .logs-failed')).toHaveCount(0);
});
