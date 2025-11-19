import {expect, test as base} from '@playwright/test';
import {
    installMockWebSocket,
    mockGithubDeployments,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockMapDownloads,
    mockNpcDownload,
    mockPeopleDownload,
    mockWiedzaDownload,
} from './mocks';

const test = base.extend({
    context: async ({context}, use) => {
        // Disable Google Analytics in tests
        await context.addInitScript(() => {
            // @ts-expect-error for disabling GA
            window.__DISABLE_GA__ = true;
        });

        await mockMapDownloads(context);
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
