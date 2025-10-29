import {expect, test as baseTest} from '@playwright/test';
import {
    installMockWebSocket,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockMapDownloads,
    mockNpcDownload,
    mockPeopleDownload,
    primeCharInfo,
} from './mocks';

const test = baseTest.extend({});

test.beforeEach(async ({context}) => {
    await mockMapDownloads(context);
    await mockMagicsDownload(context);
    await mockMagicKeysDownload(context);
    await mockNpcDownload(context);
    await mockPeopleDownload(context);
    await mockKnowledgeDownload(context);
    await installMockWebSocket(context);
    await primeCharInfo(context);
});

export {expect, test};
