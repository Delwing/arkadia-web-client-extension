import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, submitCommand, waitForCommandInput} from './support/mocks';

const CHAOS_CATEGORY_NAME = 'Chaos i jego twory';
const GOBLINS_CATEGORY_NAME = 'Goblinoidy';
const CHAOS_PRIMARY_ENTRY = 'Byles w samym sercu zamku Drachenfels';
const CHAOS_SECONDARY_ENTRY = 'Widziales smoka przemienionego przez Chaos';
const GOBLINS_ENTRY = 'Widziales orka';

test.describe('Knowledge details', () => {
    test('builds report via /wiedza_buduj and displays popup', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
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
                ` * ${CHAOS_PRIMARY_ENTRY}.`,
                ` * ${CHAOS_SECONDARY_ENTRY}.`,
                '',
                'Wiedza o Goblinoidach:',
                'z walki - brak',
                'z ksiazek i bibliotek - brak',
                'z eksploracji - znikoma',
                '',
                'Szczegoly eksploracji:',
                ` * ${GOBLINS_ENTRY}.`,
            ].join('\n'),
        );

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output, 'should confirm knowledge report update').toContainText(
            'Zaktualizowano dane raportu wiedzy',
        );

        await submitCommand(page, '/wiedza');

        const knowledgeWindow = page.locator('#knowledge-details-root .knowledge-window');
        await expect(knowledgeWindow, 'should show knowledge details window').toBeVisible();

        for (const entryName of [CHAOS_PRIMARY_ENTRY, CHAOS_SECONDARY_ENTRY, GOBLINS_ENTRY]) {
            const knowledgeEntry = knowledgeWindow.locator('.knowledge-details-entry-name', {
                hasText: entryName,
            });
            await expect(knowledgeEntry, `should list known knowledge entry: ${entryName}`).toBeVisible();

            const knowledgeEntryRow = knowledgeWindow.locator('.knowledge-details-entry', {
                has: page.locator('.knowledge-details-entry-name', { hasText: entryName }),
            });
            await expect(
                knowledgeEntryRow,
                `should mark knowledge entry as known after build: ${entryName}`,
            ).toHaveClass(/knowledge-details-entry--known/);

            const knowledgeEntryIndicator = knowledgeEntryRow.locator(
                '.knowledge-details-entry-indicator',
            );
            await expect(
                knowledgeEntryIndicator,
                `should highlight knowledge entry as completed: ${entryName}`,
            ).toHaveClass(/knowledge-details-entry-indicator--known/);
        }

        const chaosSection = knowledgeWindow.locator('.knowledge-details-category', {
            has: page.locator('.knowledge-details-name', { hasText: CHAOS_CATEGORY_NAME }),
        });
        await expect(
            chaosSection.locator('.knowledge-details-entry--known'),
            'should show two known Chaos entries in the list',
        ).toHaveCount(2);

        const chaosKnownCount = await chaosSection.locator('.knowledge-details-entry--known').count();
        const chaosTotalCount = await chaosSection.locator('.knowledge-details-entry').count();
        const chaosBadgeValue = `${chaosKnownCount}/${chaosTotalCount}`;

        await expect(
            chaosSection.locator('.knowledge-details-badge--entries'),
            'should render Chaos exploration known/total badge',
        ).toHaveText(chaosBadgeValue);

        const chaosNavButton = knowledgeWindow.locator('.knowledge-details-nav-button', {
            hasText: CHAOS_CATEGORY_NAME,
        });
        await expect(
            chaosNavButton,
            'should show Chaos totals in navigation button',
        ).toHaveText(`${CHAOS_CATEGORY_NAME} ${chaosBadgeValue}`);

        const goblinsSection = knowledgeWindow.locator('.knowledge-details-category', {
            has: page.locator('.knowledge-details-name', { hasText: GOBLINS_CATEGORY_NAME }),
        });
        await expect(
            goblinsSection.locator('.knowledge-details-entry--known'),
            'should show one known Goblinoids entry in the list',
        ).toHaveCount(1);

        const goblinsKnownCount = await goblinsSection.locator('.knowledge-details-entry--known').count();
        const goblinsTotalCount = await goblinsSection.locator('.knowledge-details-entry').count();
        const goblinsBadgeValue = `${goblinsKnownCount}/${goblinsTotalCount}`;

        await expect(
            goblinsSection.locator('.knowledge-details-badge--entries'),
            'should render Goblinoids exploration known/total badge',
        ).toHaveText(goblinsBadgeValue);

        const goblinsNavButton = knowledgeWindow.locator('.knowledge-details-nav-button', {
            hasText: GOBLINS_CATEGORY_NAME,
        });
        await expect(
            goblinsNavButton,
            'should show Goblinoids totals in navigation button',
        ).toHaveText(`${GOBLINS_CATEGORY_NAME} ${goblinsBadgeValue}`);

        const navButtonTexts = await knowledgeWindow
            .locator('.knowledge-details-nav-button')
            .allInnerTexts();
        const aggregated = navButtonTexts.reduce(
            (acc, text) => {
                const match = text.match(/(\d+)\/(\d+)/);
                if (match) {
                    acc.known += Number(match[1]);
                    acc.total += Number(match[2]);
                }
                return acc;
            },
            {known: 0, total: 0},
        );

        const overallProgress = knowledgeWindow.locator('.knowledge-window-progress');
        await expect(
            overallProgress,
            'should render aggregate knowledge totals in the header',
        ).toContainText(`${aggregated.known}/${aggregated.total}`);
    });
});

