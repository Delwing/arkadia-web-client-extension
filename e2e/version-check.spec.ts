import {expect, test} from './support/fixtures';
import type {BrowserContext, Page} from '@playwright/test';
import {ensureGameSocket, mockDeployedVersion, waitForCommandInput} from './support/mocks';

const updateNotice = (page: Page) =>
    page.locator('#commit-info .commit-info-update');

const updateToast = (page: Page) =>
    page.locator('#notification-center .toast', {hasText: 'Dostępna nowa wersja'});

/** Connects to the game, then has a deploy land while the app sits in the background. */
async function deployWhilePlaying(page: Page, context: BrowserContext) {
    await page.clock.install();
    const firstCheck = page.waitForResponse((r) => r.url().endsWith('/version.json'));
    await page.goto('/');
    await firstCheck;
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    await mockDeployedVersion(context, {sha: 'zzzzzzz'});
    await page.clock.fastForward('02:00');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

test.describe('Version check', () => {
    test('shows the notice on the login screen when a new version is deployed', async ({page, context}) => {
        await mockDeployedVersion(context, {sha: 'zzzzzzz'});

        await page.goto('/');

        await expect(updateNotice(page), 'should show new version notice').toBeVisible();
        await expect(updateNotice(page)).toContainText('Nowa wersja dostępna');
        await expect(updateNotice(page).getByRole('button', {name: 'Odśwież'})).toBeVisible();
    });

    test('does not show the notice when the deployed version is the one loaded', async ({page}) => {
        // No mock: the preview serves the version.json of the build under test.
        const versionResponse = page.waitForResponse((r) => r.url().endsWith('/version.json'));
        await page.goto('/');

        const response = await versionResponse;
        expect(response.status(), 'build should emit version.json').toBe(200);
        await expect(page.locator('#commit-info .commit-info-link')).not.toBeEmpty();
        await expect(updateNotice(page)).toHaveCount(0);
    });

    test('ignores a missing version.json', async ({page, context}) => {
        await mockDeployedVersion(context, {status: 404});
        const versionResponse = page.waitForResponse((r) => r.url().endsWith('/version.json'));

        await page.goto('/');
        await versionResponse;

        await expect(page.locator('#commit-info .commit-info-link')).not.toBeEmpty();
        await expect(updateNotice(page)).toHaveCount(0);
    });

    test('notices a deploy when the app returns to the foreground', async ({page, context}) => {
        await page.clock.install();
        const firstCheck = page.waitForResponse((r) => r.url().endsWith('/version.json'));
        await page.goto('/');
        await firstCheck;
        await expect(updateNotice(page)).toHaveCount(0);

        // A deploy happens while the PWA sits in the background.
        await mockDeployedVersion(context, {sha: 'zzzzzzz'});
        await page.clock.fastForward('02:00');
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

        await expect(updateNotice(page), 'should show new version notice').toBeVisible();
    });

    test('does not announce the new version during play by default', async ({page, context}) => {
        await deployWhilePlaying(page, context);

        await expect(updateNotice(page)).toBeAttached();
        await expect(updateToast(page)).toHaveCount(0);
    });

    test('announces the new version in the notification center when opted in', async ({page, context}) => {
        await page.addInitScript(() => {
            localStorage.setItem('shellSettings', JSON.stringify({inGameUpdateNotice: true}));
        });
        await deployWhilePlaying(page, context);

        await expect(updateToast(page), 'should show a toast').toBeVisible();
        await expect(updateNotice(page), 'login screen notice stays').toBeAttached();
    });

    test('the refresh button reloads the page', async ({page, context}) => {
        await mockDeployedVersion(context, {sha: 'zzzzzzz'});
        await page.goto('/');
        await expect(updateNotice(page)).toBeVisible();

        // After the reload the page is the deployed build, so nothing to report.
        await context.unroute('**/version.json');
        await Promise.all([
            page.waitForEvent('load'),
            updateNotice(page).getByRole('button', {name: 'Odśwież'}).click(),
        ]);

        await expect(page.locator('#commit-info .commit-info-link')).not.toBeEmpty();
        await expect(updateNotice(page)).toHaveCount(0);
    });
});
