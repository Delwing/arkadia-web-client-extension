import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushText, submitCommand, waitForCommandInput} from './support/mocks';

const CHAOS_CATEGORY_NAME = 'Chaos i jego twory';
const GOBLINS_CATEGORY_NAME = 'goblinoidy';
const CHAOS_PRIMARY_ENTRY = 'Byles w samym sercu zamku Drachenfels';
const CHAOS_SECONDARY_ENTRY = 'Widziales smoka przemienionego przez Chaos';
const GOBLINS_ENTRY = 'Widziales orka';

/** Answers /wiedza_buduj's questions the way the game would. */
async function buildReport(page: Page): Promise<void> {
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
    await expect(page.locator('#main_text_output_msg_wrapper'), 'should confirm knowledge report update')
        .toContainText('Zaktualizowano dane raportu wiedzy');
}

const knowledgeWindow = (page: Page) => page.locator('.knowledge-window');
const tab = (page: Page, label: string) => knowledgeWindow(page).locator('.kn-tabs button', {hasText: label});

test.describe('Wiedza window', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await buildReport(page);
    });

    test('/wiedza opens Kategorie: every category, and one in detail with its entries', async ({page}) => {
        await submitCommand(page, '/wiedza');
        const win = knowledgeWindow(page);
        await expect(win, 'should show the knowledge window').toBeVisible();
        await expect(tab(page, 'Kategorie')).toHaveClass(/is-on/);
        await expect(win.locator('.kn-cat-row'), 'all fourteen categories').toHaveCount(14);

        await win.locator('.kn-cat-row', {hasText: CHAOS_CATEGORY_NAME}).click();
        const detail = win.locator('.kn-cat');
        await expect(detail.locator('.kn-cat__name')).toHaveText(CHAOS_CATEGORY_NAME);
        await expect(detail.locator('.kn-source[data-source="books"] .kn-source__value')).toHaveText('znikoma');
        await expect(detail.locator('.kn-source[data-source="exploration"] .kn-source__value')).toHaveText('2 z 5 miejsc');

        // The two seen are under "Poznane"; "Brakujące" lists the other three.
        await expect(detail.locator('.kn-entry--known')).toHaveCount(0);
        await expect(detail.locator('.kn-entry--missing, .kn-entry--unavailable')).toHaveCount(3);
        await detail.locator('.kn-seg button', {hasText: 'Poznane'}).click();
        await expect(detail.locator('.kn-entry--known .kn-entry__name')).toHaveText([CHAOS_PRIMARY_ENTRY, CHAOS_SECONDARY_ENTRY]);

        await win.locator('.kn-cat-row', {hasText: GOBLINS_CATEGORY_NAME}).click();
        await expect(detail.locator('.kn-entry--known .kn-entry__name')).toHaveText([GOBLINS_ENTRY]);
    });

    test('Raport: the missing entries of every category in one column, and a search', async ({page}) => {
        await submitCommand(page, '/wiedza');
        await tab(page, 'Raport').click();
        const win = knowledgeWindow(page);
        await expect(win.locator('.kn-report__summary .kn-mono')).toHaveText('3 / 9 wpisów');
        await expect(win.locator('.kn-report-sec')).toHaveCount(2);
        await expect(win.locator('.kn-report-sec .kn-entry--known'), 'missing only by default').toHaveCount(0);

        await win.locator('.kn-toolbar .kn-seg button', {hasText: 'Wszystkie'}).click();
        await expect(win.locator('.kn-report-sec .kn-entry--known')).toHaveCount(3);

        await win.locator('#knowledge-search').fill('orka');
        await expect(win.locator('.kn-report-sec .kn-entry__name')).toHaveText([GOBLINS_ENTRY]);
    });

    test('/biblioteki opens the same window on Biblioteki', async ({page}) => {
        await submitCommand(page, '/biblioteki');
        await expect(knowledgeWindow(page)).toHaveCount(1);
        await expect(tab(page, 'Biblioteki')).toHaveClass(/is-on/);
        await expect(knowledgeWindow(page).locator('.kn-lib').first()).toBeVisible();

        // A category chip in a library opens that category.
        const chip = knowledgeWindow(page).locator('.kn-lib__cats button').first();
        const name = (await chip.textContent())!.trim();
        await chip.click();
        await expect(tab(page, 'Kategorie')).toHaveClass(/is-on/);
        await expect(knowledgeWindow(page).locator('.kn-cat__name')).toHaveText(name);
    });

    test('on a phone, categories are a list and each one a page', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await submitCommand(page, '/wiedza');
        const win = knowledgeWindow(page);
        await expect(win.locator('.kn--narrow')).toBeVisible();
        await expect(win.locator('.kn-cat'), 'no detail before a category is picked').toHaveCount(0);

        await win.locator('.kn-cat-row', {hasText: CHAOS_CATEGORY_NAME}).click();
        await expect(win.locator('.kn-cat__name')).toHaveText(CHAOS_CATEGORY_NAME);
        await expect(win.locator('.kn-cat-row')).toHaveCount(0);

        await win.locator('#knowledge-back').click();
        await expect(win.locator('.kn-cat-row')).toHaveCount(14);
    });
});
