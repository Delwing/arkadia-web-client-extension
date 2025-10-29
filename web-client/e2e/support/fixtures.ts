import {expect, test as baseTest} from '@playwright/test';
import {
    installMockWebSocket,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockPeopleDownload,
    mockNpcDownload,
} from './mocks';

const test = baseTest.extend({});

test.beforeEach(async ({context}) => {
    await mockMagicsDownload(context);
    await mockMagicKeysDownload(context);
    await mockNpcDownload(context);
    await mockPeopleDownload(context);
    await mockKnowledgeDownload(context);
    await installMockWebSocket(context);
});

export {expect, test};
