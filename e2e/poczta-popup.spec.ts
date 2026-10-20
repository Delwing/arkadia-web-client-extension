import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    primeCharInfo,
    pushText,
    resetCommandLog,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

test.describe('Poczta popup', () => {
    test('/poczta opens on a freshly fetched Odebrane list', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
        await resetCommandLog(page);

        await submitCommand(page, '/poczta');
        const popup = page.locator('.poczta-window');
        await expect(popup).toBeVisible();
        await expect(popup.locator('.popup-segmented__item', {hasText: 'Odebrane'})).toHaveClass(/is-active/);
        await expect.poll(() => getCommandLog(page)).toContain('listy odebrane');

        await pushText(page, 'Listy odebrane:\n   1. Temat: Witaj\nNadawca: Peril                          Pn, 31 VIII 2026', {type: 'mail'});
        await pushText(page, 'Rozgladasz sie po polanie.', {type: 'other'});
        await expect(popup.locator('.poczta-item', {hasText: 'Witaj'})).toBeVisible();
    });

    const LETTER = `
List : 1
Od   : Muzikuhr
Temat: Pergamin.
Do   : Gertruda, Xerks, Tester,
         Dargoth i Vesper
DW   : Borwin
Data : Wt, 20 X 2026, 16:51:38

Jestesmy u wejscia do trolli.`;
    const READER_PROMPT = '[1-50 adefFhHmnqrsRux.!?-+<>] (aktualny: 1) -- ';

    async function openLetter(page: import('@playwright/test').Page) {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);

        await submitCommand(page, '/poczta');
        const popup = page.locator('.poczta-window');
        await pushText(page, 'Listy odebrane:\n   1. Temat: Pergamin.\nNadawca: Muzikuhr                       Wt, 20 X 2026', {type: 'mail'});
        await pushText(page, 'Rozgladasz sie po polanie.', {type: 'other'});
        await popup.locator('.poczta-item', {hasText: 'Pergamin.'}).click();
        await pushText(page, `${LETTER}\n${READER_PROMPT}`, {type: 'mail'});

        const view = page.locator('.letter-view-window');
        await expect(view).toContainText('Jestesmy u wejscia do trolli.');
        return {popup, view};
    }

    test('replying to all addresses everyone on the letter but me', async ({page}) => {
        const {view} = await openLetter(page);

        await view.getByRole('button', {name: 'Odpowiedz wszystkim'}).click();
        const composer = page.locator('.letter-composer');
        await expect(composer.locator('#letter-to')).toHaveValue('Muzikuhr, Gertruda, Xerks, Dargoth, Vesper');
        await expect(composer.locator('#letter-dw')).toHaveValue('Borwin');
        await expect(composer.locator('#letter-subject')).toHaveValue('Odp: Pergamin.');
    });

    test('deleting a letter marks it in the reader and closes the view once it is gone', async ({page}) => {
        const {popup, view} = await openLetter(page);
        await resetCommandLog(page);

        const remove = view.getByTitle('Usuń list');
        await remove.click();
        await expect(remove).toHaveText('Na pewno?');
        await remove.click();
        await expect.poll(() => getCommandLog(page)).toEqual(['przeczytaj list 1']);

        await pushText(page, `${LETTER}\n${READER_PROMPT}`, {type: 'mail'});
        await expect.poll(() => getCommandLog(page)).toEqual(['przeczytaj list 1', 'd']);
        await pushText(page, `Zaznaczono do skasowania: 1.\n${READER_PROMPT}`, {type: 'mail'});
        await expect.poll(() => getCommandLog(page)).toEqual(['przeczytaj list 1', 'd', 'q']);

        await pushText(page, 'Kasuje listy...\nKasuje: 1.', {type: 'mail'});
        await expect(view).toBeHidden();
        // The remaining letters are renumbered, so the open list is fetched again.
        await expect.poll(() => getCommandLog(page)).toContain('listy odebrane');
        await expect(popup).toBeVisible();
    });
});
