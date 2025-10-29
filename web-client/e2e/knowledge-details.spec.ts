import {expect, test} from '@playwright/test';
import {
    ensureGameSocket,
    installMockWebSocket,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockPeopleDownload,
    mockNpcDownload,
    pushText,
    submitCommand,
    waitForClientReady,
} from './support/mocks';

const KNOWLEDGE_ENTRY_TEXT = 'Byles w samym sercu zamku Drachenfels';

test.beforeEach(async ({context}) => {
    await mockMagicsDownload(context);
    await mockMagicKeysDownload(context);
    await mockNpcDownload(context);
    await mockPeopleDownload(context);
    await mockKnowledgeDownload(context);
    await installMockWebSocket(context);
});

test.describe('Knowledge details', () => {
    test('builds report via /wiedza_buduj and displays popup', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        await submitCommand(page, '/wiedza_buduj');

        await page.waitForFunction(() => {
            const log = (window as any).__mockCommandLog;
            return Array.isArray(log) && log.some((entry) => typeof entry === 'string' && entry.includes('wiedza o chaosie'));
        });

        await pushText(
            page,
            [
                'Wiedza o Chaosie i jego tworach:',
                'z walki - brak',
                'z ksiazek i bibliotek - znikoma',
                'z eksploracji - znikoma',
                '',
                'Szczegoly eksploracji:',
                ` * ${KNOWLEDGE_ENTRY_TEXT}.`,
            ].join('\n'),
        );

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output, 'should confirm knowledge report update').toContainText(
            'Zaktualizowano dane raportu wiedzy',
        );

        await submitCommand(page, '/wiedza');

        const knowledgeWindow = page.locator('#knowledge-details-root .knowledge-window');
        await expect(knowledgeWindow, 'should show knowledge details window').toBeVisible();

        const knowledgeEntry = knowledgeWindow.locator('.knowledge-details-entry-name', {
            hasText: KNOWLEDGE_ENTRY_TEXT,
        });
        await expect(knowledgeEntry, 'should list known knowledge entry after build').toBeVisible();

        const knowledgeEntryRow = knowledgeWindow.locator('.knowledge-details-entry', {
            has: page.locator('.knowledge-details-entry-name', { hasText: KNOWLEDGE_ENTRY_TEXT }),
        });
        await expect(
            knowledgeEntryRow,
            'should mark knowledge entry as known after build',
        ).toHaveClass(/knowledge-details-entry--known/);

        const knowledgeEntryIndicator = knowledgeEntryRow.locator('.knowledge-details-entry-indicator');
        await expect(
            knowledgeEntryIndicator,
            'should highlight knowledge entry as completed',
        ).toHaveClass(/knowledge-details-entry-indicator--known/);

    });
});

