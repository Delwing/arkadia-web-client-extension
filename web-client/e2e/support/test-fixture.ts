import {test as base} from '@playwright/test';
import {
    installMockWebSocket,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockPeopleDownload,
    mockNpcDownload,
} from './mocks';

const test = base.extend({
    context: async ({context}, use) => {
        await mockMagicsDownload(context);
        await mockMagicKeysDownload(context);
        await mockNpcDownload(context);
        await mockPeopleDownload(context);
        await mockKnowledgeDownload(context);
        await installMockWebSocket(context);
        await use(context);
    },
});

export {test};
export {expect} from '@playwright/test';
