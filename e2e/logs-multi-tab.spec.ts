import {expect, test} from './support/fixtures';
import {dialogClose} from './support/dialogs';
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

const DIALOG = '.logs-dialog';

async function openLogs(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await expect(page.locator(DIALOG), 'logs window should open').toBeVisible({timeout: 5000});
    await expect(page.locator('.lv-log'), 'the log pane should render').toBeVisible({timeout: 5000});
}

async function closeLogs(page: Page): Promise<void> {
    await dialogClose(page.locator(DIALOG)).click();
    await expect(page.locator(DIALOG), 'logs window should close').not.toBeVisible({timeout: 5000});
}

/** One entry per session, in the viewer's sidebar. */
const sessionItems = (page: Page) => page.locator('.lv-session');

test.describe('Logs across tabs', () => {
    test('a second tab logs and reads while the first tab has the log browser open', async ({context, page: first}) => {
        await login(first, 'Alfa');
        await pushText(first, 'Alfa pisze w pierwszej karcie');

        await openLogs(first);
        await expect(first.locator(DIALOG)).toContainText('Alfa pisze w pierwszej karcie');
        await expect(sessionItems(first)).toHaveCount(1);
        // Left open on purpose: an open browser must not hold the database.

        const second = await context.newPage();
        await login(second, 'Beta');
        await pushText(second, 'Beta pisze w drugiej karcie');

        await openLogs(second);
        await expect(sessionItems(second), 'the second tab created its own session').toHaveCount(2);
        await expect(second.locator(DIALOG), 'and can read it').toContainText('Beta pisze w drugiej karcie');
        await closeLogs(second);

        await pushText(first, 'Alfa pisze dalej po drugiej karcie');
        await closeLogs(first);
        await openLogs(first);
        await expect(sessionItems(first), 'the first tab sees the new session').toHaveCount(2);
        await expect(
            first.locator(DIALOG),
            'and its own logging kept going',
        ).toContainText('Alfa pisze dalej po drugiej karcie');
    });

    test('a second tab logs after the first tab browsed logs and closed the browser', async ({context, page: first}) => {
        await login(first, 'Alfa');
        await pushText(first, 'Alfa przeglada logi');
        await openLogs(first);
        await expect(first.locator(DIALOG)).toContainText('Alfa przeglada logi');
        await closeLogs(first);

        const second = await context.newPage();
        await login(second, 'Beta');
        await pushText(second, 'Beta loguje po zamknieciu przegladarki');

        await openLogs(second);
        await expect(sessionItems(second)).toHaveCount(2);
        await expect(second.locator(DIALOG)).toContainText('Beta loguje po zamknieciu przegladarki');
    });
});
