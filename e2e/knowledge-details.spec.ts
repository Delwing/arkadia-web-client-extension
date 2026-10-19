import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getCommandLog, pushText, submitCommand, waitForCommandInput} from './support/mocks';

const CHAOS_CATEGORY_NAME = 'Chaos i jego twory';
const GOBLINS_CATEGORY_NAME = 'goblinoidy';
const CHAOS_PRIMARY_ENTRY = 'Byles w samym sercu zamku Drachenfels';
const CHAOS_SECONDARY_ENTRY = 'Widziales smoka przemienionego przez Chaos';
const GOBLINS_ENTRY = 'Widziales orka';

const PAGER_PROMPT = '[linia 60/71 - ENTER by przejsc dalej, q by przerwac, ? by uzyskac pomoc]';

const CHAOS_REPLY = [
    'Wiedza o Chaosie i jego tworach:',
    'z walki - brak',
    'z ksiazek i bibliotek - znikoma',
    'z eksploracji - znikoma',
    '',
    'Szczegoly eksploracji:',
    ` * ${CHAOS_PRIMARY_ENTRY}.`,
    ` * ${CHAOS_SECONDARY_ENTRY}.`,
];

const GOBLINS_REPLY = [
    'Wiedza o Goblinoidach:',
    'z walki - brak',
    'z ksiazek i bibliotek - brak',
    'z eksploracji - znikoma',
    '',
    'Szczegoly eksploracji:',
    ` * ${GOBLINS_ENTRY}.`,
];

/** Every category /wiedza_buduj asks about, in order. */
const KNOWLEDGE_COMMANDS = [
    'wiedza o chaosie i jego tworach',
    'wiedza o goblinoidach',
    'wiedza o golemach',
    'wiedza o istotach demonicznych',
    'wiedza o jaszczuroludziach',
    'wiedza o magii i jej tworach',
    'wiedza o nieumarlych',
    'wiedza o pajakach i pajakowatych',
    'wiedza o ryboludziach',
    'wiedza o smokach i smokowatych',
    'wiedza o starszych rasach',
    'wiedza o stworach pokoniunkcyjnych',
    'wiedza o szczuroludziach',
    'wiedza o wampirach',
];

async function waitForCommand(page: Page, command: string): Promise<void> {
    await page.waitForFunction((expected) => {
        const log = (window as any).__mockCommandLog;
        return Array.isArray(log) && log.includes(expected);
    }, command);
}

const output = (page: Page) => page.locator('#main_text_output_msg_wrapper');
const reportToast = (page: Page) => page.locator('#notification-center .toast', {hasText: 'raport'});

async function hasSent(page: Page, command: string): Promise<boolean> {
    return (await getCommandLog(page)).includes(command);
}

/** Answers /wiedza_buduj's questions the way the game would: one reply per question asked. */
async function answerCategories(page: Page, replies: Partial<Record<string, string[]>>): Promise<void> {
    for (const command of KNOWLEDGE_COMMANDS) {
        await waitForCommand(page, command);
        const reply = replies[command] ?? [`W${command.slice(1)}:`, 'z walki - brak'];
        await pushText(page, reply.join('\n'));
    }
    await expect(reportToast(page), 'should confirm knowledge report update')
        .toContainText('Zaktualizowano raport wiedzy');
}

async function buildReport(page: Page): Promise<void> {
    await submitCommand(page, '/wiedza_buduj');
    await answerCategories(page, {
        'wiedza o chaosie i jego tworach': CHAOS_REPLY,
        'wiedza o goblinoidach': GOBLINS_REPLY,
    });
}

test.describe('/wiedza_buduj', () => {
    test('a reply cut by the pager holds the next question until its last page', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await submitCommand(page, '/wiedza_buduj');
        await waitForCommand(page, 'wiedza o chaosie i jego tworach');
        await pushText(page, [...CHAOS_REPLY.slice(0, 7), PAGER_PROMPT].join('\n'));
        await expect(reportToast(page), 'a toast follows the progress').toContainText('1 z 14: Chaos i jego twory');

        // Anything sent now would land in the pager and be lost: only the automatic ENTER may go.
        await page.waitForTimeout(1000);
        expect(await hasSent(page, 'wiedza o goblinoidach'), 'next question must wait for the last page').toBe(false);

        await pushText(page, CHAOS_REPLY.slice(7).join('\n'));
        await answerCategories(page, {
            'wiedza o chaosie i jego tworach': [],
            'wiedza o goblinoidach': GOBLINS_REPLY,
        });
        await expect(reportToast(page)).not.toContainText('Brak odpowiedzi');

        // The report goes to the window; the output keeps none of it.
        await expect(output(page)).not.toContainText('Wiedza o Chaosie');
        await expect(output(page)).not.toContainText(CHAOS_PRIMARY_ENTRY);
        await expect(output(page)).not.toContainText('Wiedza o Goblinoidach');
        await expect(output(page)).not.toContainText('linia 60/71');
        await expect(output(page)).not.toContainText('wiedza o golemach');
    });
});

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
        await expect(detail.locator('.kn-source[data-source="exploration"] .kn-source__value')).toHaveText('znikoma');

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

        // Only the .kn-search wrapper draws a border - not the focused input inside it.
        const inner = await win.locator('#knowledge-search').evaluate((el) => {
            const s = getComputedStyle(el);
            return {border: s.borderTopWidth, shadow: s.boxShadow};
        });
        expect(inner).toEqual({border: '0px', shadow: 'none'});
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

    test('Biblioteki: every library away from here can be led to', async ({page}) => {
        await submitCommand(page, '/biblioteki');
        const libs = knowledgeWindow(page).locator('.kn-lib:not(.is-here)');
        await expect(libs.first()).toBeVisible();
        await expect(libs.locator('.kn-lib__lead')).toHaveCount(await libs.count());
    });

    test('Księgi: every book with its categories, read one by one', async ({page}) => {
        const BOOK = 'ceramiczna wypalona tabliczka';
        await submitCommand(page, '/wiedza');
        await tab(page, 'Księgi').click();
        const win = knowledgeWindow(page);
        const book = win.locator(`.kn-book[data-book="${BOOK}"]`);
        const chip = book.locator('.kn-lib__cats button', {hasText: CHAOS_CATEGORY_NAME});
        await expect(chip).toHaveAttribute('data-status', 'not_started');

        await win.locator('#knowledge-hide-read').uncheck();
        await chip.click();
        await expect(chip).toHaveAttribute('data-status', 'completed');

        // Read through, it hides behind "Pokaż" while read ones are hidden.
        await win.locator('#knowledge-hide-read').check();
        await expect(book).toHaveCount(0);
        await expect(win.locator('.kn-libs__done')).toContainText('1 księga przeczytana');

        // Kategorie shows the same book as read.
        await tab(page, 'Kategorie').click();
        await win.locator('.kn-cat-row', {hasText: CHAOS_CATEGORY_NAME}).click();
        await expect(win.locator('.kn-cat .kn-card__row', {hasText: BOOK}).locator('[data-status]')).toHaveAttribute('data-status', 'completed');
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

        // Six tabs do not fit: the strip scrolls, every label whole, the open one in sight.
        const tabs = win.locator('.kn-tabs');
        const clipped = await tabs.locator('button').evaluateAll((buttons) => buttons.filter((b) => b.scrollWidth > b.clientWidth).length);
        expect(clipped, 'no tab squashed into a clipped label').toBe(0);
        await tab(page, 'Historia').click();
        await expect(tab(page, 'Historia')).toBeInViewport({ratio: 1});
        await submitCommand(page, '/biblioteki');
        await expect(tab(page, 'Biblioteki')).toBeInViewport({ratio: 1});
    });
});
