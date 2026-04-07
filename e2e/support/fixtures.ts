import {expect, test as base} from '@playwright/test';
import {
    installMockWebSocket,
    mockGithubDeployments,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockMapDownloads,
    mockMapReleaseVersion,
    mockNpcDownload,
    mockPeopleDownload,
    mockWiedzaDownload,
} from './mocks';

const test = base.extend({
    context: async ({context}, use) => {
        // Block external network requests that can stall page load
        await context.route(/googletagmanager\.com|google-analytics\.com|buycoffee\.to|fonts\.googleapis\.com|fonts\.gstatic\.com/, route => route.abort());

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
        await mockWiedzaDownload(context);
        await mockGithubDeployments(context);
        await installMockWebSocket(context);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(context);
    },
});

export {expect, test};
