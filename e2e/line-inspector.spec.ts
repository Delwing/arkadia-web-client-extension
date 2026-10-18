import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, submitCommand, waitForCommandInput} from './support/mocks';

/** carriage.ts recolors this line (tag carriageMode) - a change that keeps the text. */
const RECOLORED_LINE = 'Dojechaliscie do rozdrozy.';
const PLAIN_LINE = 'Zwykla linia do inspektora.';

test.describe('Line inspector', () => {
    test('lists raw lines and the triggers that touched them', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Nothing is recorded while the window is closed.
        await pushText(page, 'Linia sprzed otwarcia.', {type: 'other'});

        await submitCommand(page, '/debug');
        const popup = page.locator('.line-insp-popup');
        await expect(popup).toBeVisible();

        await pushText(page, PLAIN_LINE, {type: 'other'});
        await pushText(page, RECOLORED_LINE, {type: 'other'});

        const rows = popup.locator('.line-insp-row');
        await expect(rows.filter({hasText: PLAIN_LINE})).toHaveCount(1);
        await expect(rows.filter({hasText: RECOLORED_LINE})).toHaveCount(1);
        await expect(rows.filter({hasText: 'Linia sprzed otwarcia.'})).toHaveCount(0);

        // "Zmienione" keeps the recolored line and drops the untouched one.
        await popup.locator('.popup-segmented__item', {hasText: 'Zmienione'}).click();
        await expect(rows.filter({hasText: PLAIN_LINE})).toHaveCount(0);
        const recolored = rows.filter({hasText: RECOLORED_LINE});
        await expect(recolored).toHaveCount(1);
        await expect(recolored.locator('.line-insp-mark')).toHaveText('✎');

        await recolored.click();
        const detail = popup.locator('.line-insp-detail');
        await expect(detail.locator('.line-insp-raw')).toHaveText(RECOLORED_LINE);
        const step = detail.locator('.line-insp-step', {hasText: 'carriageMode'});
        await expect(step).toHaveCount(1);
        await expect(step.locator('.line-insp-step-outcome')).toHaveText('zmienił');
        // The step's "after" carries the color the trigger applied; the raw line has none.
        await expect(step.locator('.line-insp-step-diff span[style*="color"]').first()).toBeVisible();

        // Search reaches trigger names too.
        await popup.locator('.popup-segmented__item', {hasText: 'Wszystkie'}).click();
        await popup.locator('.line-insp-search').fill('carriagemode');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(RECOLORED_LINE);
    });
});
