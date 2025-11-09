import {test as base, expect} from '@playwright/test';
import {
    installMockWebSocket,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockMapDownloads,
    mockNpcDownload,
    mockPeopleDownload,
    getCurrentCommitSha,
} from './support/mocks';

// Custom fixture that doesn't include GitHub mocks by default
const test = base.extend({
    context: async ({context}, use) => {
        await mockMapDownloads(context);
        await mockMagicsDownload(context);
        await mockMagicKeysDownload(context);
        await mockNpcDownload(context);
        await mockPeopleDownload(context);
        await mockKnowledgeDownload(context);
        // NOT setting up GitHub mock here - tests will do it individually
        await installMockWebSocket(context);
        await use(context);
    },
});

test.describe('Version check', () => {
    test('shows warning when new version is available', async ({page, context}) => {
        // Set a route that returns a different SHA (simulating new version)
        // The SHA will be truncated to 7 chars by main.ts, so we need a different first 7 chars
        const newVersionSha = 'zzzzzzz1234567890123456789012345678901';

        await page.route('https://api.github.com/repos/Delwing/arkadia-web-client-extension/commits/master', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    sha: newVersionSha,
                }),
            });
        });

        await page.goto('/');

        // DO NOT close the auth overlay - commit-info is visible in the overlay
        // Wait for the commit info element to be populated
        const commitInfo = page.locator('#commit-info');
        await commitInfo.waitFor({state: 'visible', timeout: 5000});

        // Wait a bit for the fetch to complete and warning to appear
        await page.waitForTimeout(500);

        // Check that the warning div appears
        const warningDiv = commitInfo.locator('div').filter({hasText: 'Nowa wersja dostępna'});
        await expect(warningDiv, 'should show new version warning').toBeVisible();
        await expect(warningDiv, 'warning should be in red').toHaveCSS('color', 'rgb(255, 0, 0)');
        await expect(warningDiv, 'warning should have correct text').toContainText('Nowa wersja dostępna - odśwież stronę');
    });

    test('does not show warning when version is current', async ({page}) => {
        // Set up mock that returns the current SHA (simulating no new version)
        await page.route('https://api.github.com/repos/Delwing/arkadia-web-client-extension/commits/master', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    sha: getCurrentCommitSha(), // Matches current commit
                }),
            });
        });

        await page.goto('/');

        // DO NOT close the auth overlay - commit-info is visible in the overlay
        // Wait for the commit info element to be populated
        const commitInfo = page.locator('#commit-info');
        await commitInfo.waitFor({state: 'visible', timeout: 5000});

        // Verify commit info shows SHA and date
        await expect(commitInfo, 'should show commit info').not.toBeEmpty();

        // Wait a bit for any potential warning to appear
        await page.waitForTimeout(500);

        // Check that NO warning div appears
        const warningDiv = commitInfo.locator('div').filter({hasText: 'Nowa wersja dostępna'});
        await expect(warningDiv, 'should not show new version warning').toHaveCount(0);
    });

    test('handles GitHub API rate limit gracefully', async ({page}) => {
        // Capture console messages before navigation
        const consoleWarnings: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'warning') {
                consoleWarnings.push(msg.text());
            }
        });

        // Set up mock to simulate rate limiting
        await page.route('https://api.github.com/repos/Delwing/arkadia-web-client-extension/commits/master', async (route) => {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'API rate limit exceeded',
                }),
            });
        });

        await page.goto('/');

        // DO NOT close the auth overlay - commit-info is visible in the overlay
        // Wait for the commit info element to be populated
        const commitInfo = page.locator('#commit-info');
        await commitInfo.waitFor({state: 'visible', timeout: 5000});

        // Verify commit info still shows (just SHA and date, no warning)
        await expect(commitInfo, 'should show commit info').not.toBeEmpty();

        // Wait a bit to ensure no warning appears
        await page.waitForTimeout(500);

        // Check that NO warning appears (rate limit is handled silently)
        const warningDiv = commitInfo.locator('div').filter({hasText: 'Nowa wersja dostępna'});
        await expect(warningDiv, 'should not show warning on rate limit').toHaveCount(0);

        // Wait a bit for console messages to be captured
        await page.waitForTimeout(500);

        // Verify the warning was logged to console
        const hasRateLimitWarning = consoleWarnings.some(
            (msg) => msg.includes('GitHub API rate limit') || msg.includes('rate limit exceeded')
        );
        expect(hasRateLimitWarning, 'should log rate limit warning to console').toBeTruthy();
    });
});
