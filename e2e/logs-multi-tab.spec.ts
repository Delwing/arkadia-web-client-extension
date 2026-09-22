import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

// Every session is its own object store, so a tab that starts logging has to
// upgrade the logs database — which waits for every other tab to close its
// connection. The Logi browser used to keep its connection for good once
// opened, so a second tab could never create its session, and every later
// open queued behind that upgrade: logging and log reading stopped in all tabs.

async function login(page: Page, name: string): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name, object_num: 12345});
    await waitForCharacter(page, name);
}

async function openLogs(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await page.waitForSelector('#logs-modal:not([hidden])', {timeout: 5000});
    await expect(page.locator('.lv')).toBeVisible();
}

async function closeLogs(page: Page): Promise<void> {
    await page.locator('#logs-close').click();
    await page.waitForSelector('#logs-modal:not([hidden])', {state: 'hidden', timeout: 5000});
}

/** Sessions are a sidebar list now, not a `<select>`. */
const sessionEntries = (page: Page) => page.locator('.lv-session');

test.describe('Logs across tabs', () => {
    test('a second tab logs and reads while the first tab has the log browser open', async ({context, page: first}) => {
        await login(first, 'Alfa');
        await pushText(first, 'Alfa pisze w pierwszej karcie');

        await openLogs(first);
        await expect(first.locator('#logs-modal')).toContainText('Alfa pisze w pierwszej karcie');
        await expect(sessionEntries(first)).toHaveCount(1);
        // Left open on purpose: an open browser must not hold the database.

        const second = await context.newPage();
        await login(second, 'Beta');
        await pushText(second, 'Beta pisze w drugiej karcie');

        await openLogs(second);
        await expect(sessionEntries(second), 'the second tab created its own session').toHaveCount(2);
        await expect(second.locator('#logs-modal'), 'and can read it').toContainText('Beta pisze w drugiej karcie');
        await closeLogs(second);

        await pushText(first, 'Alfa pisze dalej po drugiej karcie');
        await closeLogs(first);
        await openLogs(first);
        await expect(sessionEntries(first), 'the first tab sees the new session').toHaveCount(2);
        await expect(
            first.locator('#logs-modal'),
            'and its own logging kept going',
        ).toContainText('Alfa pisze dalej po drugiej karcie');
    });

    test('a second tab logs after the first tab browsed logs and closed the browser', async ({context, page: first}) => {
        await login(first, 'Alfa');
        await pushText(first, 'Alfa przeglada logi');
        await openLogs(first);
        await expect(first.locator('#logs-modal')).toContainText('Alfa przeglada logi');
        await closeLogs(first);

        const second = await context.newPage();
        await login(second, 'Beta');
        await pushText(second, 'Beta loguje po zamknieciu przegladarki');

        await openLogs(second);
        await expect(sessionEntries(second)).toHaveCount(2);
        await expect(second.locator('#logs-modal')).toContainText('Beta loguje po zamknieciu przegladarki');
    });
});
