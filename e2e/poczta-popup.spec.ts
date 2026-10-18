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
});
