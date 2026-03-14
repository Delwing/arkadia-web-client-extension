import {test as base, expect} from '@playwright/test';
import {
    installMockWebSocket,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockMapDownloads,
    mockMapReleaseVersion,
    mockNpcDownload,
    mockPeopleDownload,
    getCurrentCommitSha,
    mockGithubDeployments,
} from './support/mocks';

// Custom fixture that doesn't include GitHub mocks by default
const test = base.extend({
    context: async ({context}, use) => {
        // Block Google Analytics network requests
        await context.route(/googletagmanager\.com|google-analytics\.com/, route => route.abort());

        // Disable Google Analytics and Firebase in tests
        await context.addInitScript(() => {
            // @ts-expect-error for disabling GA
            window.__DISABLE_GA__ = true;
            // @ts-expect-error for disabling Firebase
            window.__DISABLE_FIREBASE__ = true;
        });

        await mockMapDownloads(context);
        await mockMapReleaseVersion(context);
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

        await mockGithubDeployments(context, {sha: newVersionSha});

        await page.goto('/');

        // DO NOT close the auth overlay - commit-info is visible in the overlay
        // Wait for the commit info element to be populated
        const commitInfo = page.locator('#commit-info');
        await commitInfo.waitFor({state: 'visible', timeout: 5000});

        // Check that the warning div appears
        const warningDiv = commitInfo.locator('div').filter({hasText: 'Nowa wersja dostępna'});
        await expect(warningDiv, 'should show new version warning').toBeVisible();
        await expect(warningDiv, 'warning should be in red').toHaveCSS('color', 'rgb(255, 0, 0)');
        await expect(warningDiv, 'warning should have correct text').toContainText('Nowa wersja dostępna - odśwież stronę');
    });

    test('does not show warning when version is current', async ({page, context}) => {
        // Set up mock that returns the current SHA (simulating no new version)
        await mockGithubDeployments(context, {sha: getCurrentCommitSha()});

        await page.goto('/');

        // DO NOT close the auth overlay - commit-info is visible in the overlay
        // Wait for the commit info element to be populated
        const commitInfo = page.locator('#commit-info');
        await commitInfo.waitFor({state: 'visible', timeout: 5000});

        // Verify commit info shows SHA and date
        await expect(commitInfo, 'should show commit info').not.toBeEmpty();

        // Short wait to confirm no warning appears when version is current (negative assertion)
        await page.waitForTimeout(200);

        // Check that NO warning div appears
        const warningDiv = commitInfo.locator('div').filter({hasText: 'Nowa wersja dostępna'});
        await expect(warningDiv, 'should not show new version warning').toHaveCount(0);
    });

    test('handles GitHub API rate limit gracefully', async ({page, context}) => {
        // Capture console messages before navigation
        const consoleWarnings: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'warning') {
                consoleWarnings.push(msg.text());
            }
        });

        // Set up mock to simulate rate limiting
        await mockGithubDeployments(context, {simulateRateLimit: true});

        await page.goto('/');

        // DO NOT close the auth overlay - commit-info is visible in the overlay
        // Wait for the commit info element to be populated
        const commitInfo = page.locator('#commit-info');
        await commitInfo.waitFor({state: 'visible', timeout: 5000});

        // Verify commit info still shows (just SHA and date, no warning)
        await expect(commitInfo, 'should show commit info').not.toBeEmpty();

        // Short wait to confirm no warning appears on rate limit (negative assertion)
        await page.waitForTimeout(200);

        // Check that NO warning appears (rate limit is handled silently)
        const warningDiv = commitInfo.locator('div').filter({hasText: 'Nowa wersja dostępna'});
        await expect(warningDiv, 'should not show warning on rate limit').toHaveCount(0);

        // Verify the warning was logged to console
        const hasRateLimitWarning = consoleWarnings.some(
            (msg) => msg.includes('GitHub API rate limit') || msg.includes('rate limit exceeded')
        );
        expect(hasRateLimitWarning, 'should log rate limit warning to console').toBeTruthy();
    });
});
