import {expect, test} from './support/fixtures';
import {mockDeployedVersion} from './support/mocks';

const updateNotice = (page: import('@playwright/test').Page) =>
    page.locator('#commit-info .commit-info-update');

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
