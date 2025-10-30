import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    pushText,
    submitCommand,
    waitForClientReady,
} from './support/mocks';

const CHAOS_CATEGORY_NAME = 'Chaos i jego twory';
const GOBLINS_CATEGORY_NAME = 'Goblinoidy';
const CHAOS_PRIMARY_ENTRY = 'Byles w samym sercu zamku Drachenfels';
const CHAOS_SECONDARY_ENTRY = 'Widziales smoka przemienionego przez Chaos';
const GOBLINS_ENTRY = 'Widziales orka';

type KnowledgeDetailsCategorySummary = {
    name: string;
    types: Partial<Record<'fight' | 'books' | 'exploration', {known: number; total: number}>>;
};

type KnowledgeDetailsReportPayload = {
    categories: KnowledgeDetailsCategorySummary[];
};

test.describe('Knowledge details', () => {
    test('builds report via /wiedza_buduj and displays popup', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        await page.evaluate(() => {
            const globalScope: any = window;
            globalScope.__capturedKnowledgeReport = null;
            globalScope.addEventListener('knowledgeDetailsReport', (event: Event) => {
                globalScope.__capturedKnowledgeReport = (event as CustomEvent).detail;
            });
        });

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

        const knowledgeReport = (await page.evaluate(() => {
            return (window as any).__capturedKnowledgeReport;
        })) as KnowledgeDetailsReportPayload | null;

        expect(knowledgeReport, 'should capture knowledge report payload').toBeTruthy();
        if (!knowledgeReport) {
            throw new Error('Knowledge report payload was not captured');
        }

        const normalizeName = (value: string) => value.trim().toLowerCase();
        const findCategory = (name: string): KnowledgeDetailsCategorySummary | undefined => {
            const normalized = normalizeName(name);
            return knowledgeReport.categories.find(
                (category) => normalizeName(category.name) === normalized,
            );
        };

        const chaosSummary = findCategory(CHAOS_CATEGORY_NAME);
        expect(chaosSummary, 'should include Chaos category in report').toBeTruthy();

        const goblinsSummary = findCategory(GOBLINS_CATEGORY_NAME);
        expect(goblinsSummary, 'should include Goblinoids category in report').toBeTruthy();

        const chaosExploration = chaosSummary?.types.exploration;
        const goblinsExploration = goblinsSummary?.types.exploration;

        expect(chaosExploration?.known, 'should record two known Chaos entries').toBe(2);
        expect(goblinsExploration?.known, 'should record one known Goblinoids entry').toBe(1);

        const chaosSection = knowledgeWindow.locator('.knowledge-details-category', {
            has: page.locator('.knowledge-details-name', { hasText: CHAOS_CATEGORY_NAME }),
        });
        await expect(
            chaosSection.locator('.knowledge-details-entry--known'),
            'should show two known Chaos entries in the list',
        ).toHaveCount(2);

        const chaosCategoryName = chaosSummary?.name ?? CHAOS_CATEGORY_NAME;
        if (chaosExploration) {
            await expect(
                chaosSection.locator('.knowledge-details-badge--entries'),
                'should render Chaos exploration known/total badge',
            ).toHaveText(`${chaosExploration.known}/${chaosExploration.total}`);

            const chaosNavButton = knowledgeWindow.locator('.knowledge-details-nav-button', {
                hasText: chaosCategoryName,
            });
            await expect(
                chaosNavButton,
                'should show Chaos totals in navigation button',
            ).toHaveText(`${chaosCategoryName} ${chaosExploration.known}/${chaosExploration.total}`);
        }

        const goblinsSection = knowledgeWindow.locator('.knowledge-details-category', {
            has: page.locator('.knowledge-details-name', { hasText: GOBLINS_CATEGORY_NAME }),
        });
        await expect(
            goblinsSection.locator('.knowledge-details-entry--known'),
            'should show one known Goblinoids entry in the list',
        ).toHaveCount(1);

        const goblinsCategoryName = goblinsSummary?.name ?? GOBLINS_CATEGORY_NAME;
        if (goblinsExploration) {
            await expect(
                goblinsSection.locator('.knowledge-details-badge--entries'),
                'should render Goblinoids exploration known/total badge',
            ).toHaveText(`${goblinsExploration.known}/${goblinsExploration.total}`);

            const goblinsNavButton = knowledgeWindow.locator('.knowledge-details-nav-button', {
                hasText: goblinsCategoryName,
            });
            await expect(
                goblinsNavButton,
                'should show Goblinoids totals in navigation button',
            ).toHaveText(`${goblinsCategoryName} ${goblinsExploration.known}/${goblinsExploration.total}`);
        }

        const totals = knowledgeReport.categories.reduce(
            (acc, category) => {
                const exploration = category.types.exploration;
                if (exploration) {
                    acc.known += exploration.known;
                    acc.total += exploration.total;
                }
                return acc;
            },
            {known: 0, total: 0},
        );

        const percentage = totals.total > 0 ? Math.round((totals.known / totals.total) * 100) : 0;

        const overallProgress = knowledgeWindow.locator('.knowledge-window-progress');
        await expect(
            overallProgress,
            'should render aggregate knowledge totals in the header',
        ).toHaveText(`${totals.known}/${totals.total} (${percentage}%)`);
    });
});

