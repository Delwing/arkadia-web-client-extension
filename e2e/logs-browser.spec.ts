import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

async function login(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'Tester', object_num: 12345});
    await waitForCharacter(page, 'Tester');
}

async function openLogs(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await page.waitForSelector('#logs-modal.show', {timeout: 5000});
}

/** Pushes `count` filler lines, each long enough to wrap in the preview on some rows. */
async function pushFiller(page: Page, prefix: string, count: number): Promise<void> {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
        lines.push(`${prefix} ${i} ` + 'krasnolud patrzy podejrzliwie '.repeat(i % 7 === 0 ? 12 : 1));
    }
    await pushText(page, lines.join('\n'));
}

/** True when the active search line sits inside the preview's visible area. */
async function activeLineInView(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const preview = document.getElementById('logs-preview')!;
        const line = preview.querySelector('.logs-preview-highlight');
        if (!line) return false;
        const p = preview.getBoundingClientRect();
        const r = line.getBoundingClientRect();
        return r.top >= p.top && r.bottom <= p.bottom;
    });
}

test.describe('Logi browser', () => {
    test('clicking a result in another session scrolls to it on the first click', async ({page}) => {
        // Session 1: the match, followed by enough lines that it is far from the end.
        await login(page);
        await pushText(page, 'Stara sesja: SZUKANY_ZNACZNIK tutaj');
        await pushFiller(page, 'stara', 300);

        // Reloading starts a new session, which the browser opens by default.
        await login(page);
        await pushFiller(page, 'nowa', 50);

        await openLogs(page);
        await expect(page.locator('#logs-preview')).toContainText('nowa 49');

        await page.fill('#logs-search-input', 'SZUKANY_ZNACZNIK');
        await page.press('#logs-search-input', 'Enter');
        const result = page.locator('.logs-search-result');
        await expect(result).toHaveCount(1);
        await expect(page.locator('.logs-search-summary')).toHaveText('1 trafienie w 1 sesji');

        // Searching already jumps to the first result.
        await expect(page.locator('#logs-preview .logs-preview-highlight')).toContainText('SZUKANY_ZNACZNIK');
        await expect.poll(() => activeLineInView(page)).toBe(true);

        // Scroll away, then a single click must bring it back.
        await page.locator('#logs-preview').hover();
        await page.mouse.wheel(0, 100000);
        await expect.poll(() => activeLineInView(page)).toBe(false);
        await result.click();
        await expect.poll(() => activeLineInView(page)).toBe(true);
    });

    test('Enter steps through results and wraps around', async ({page}) => {
        await login(page);
        await pushText(page, 'pierwszy TRAF');
        await pushFiller(page, 'a', 40);
        await pushText(page, 'drugi TRAF');
        await pushFiller(page, 'b', 40);

        await openLogs(page);
        const input = page.locator('#logs-search-input');
        await input.fill('TRAF');
        await input.press('Enter');
        const position = page.locator('.logs-search-position');
        await expect(position).toHaveText('1 / 2');
        await input.press('Enter');
        await expect(position).toHaveText('2 / 2');
        await expect(page.locator('#logs-preview .logs-preview-highlight')).toContainText('drugi TRAF');
        await input.press('Enter');
        await expect(position).toHaveText('1 / 2');
        await input.press('Shift+Enter');
        await expect(position).toHaveText('2 / 2');
    });

    test('Page Up scrolls the preview', async ({page}) => {
        await login(page);
        await pushFiller(page, 'linia', 200);
        await openLogs(page);
        const preview = page.locator('#logs-preview');
        await expect(preview).toContainText('linia 199');

        const before = await preview.evaluate(el => el.scrollTop);
        expect(before).toBeGreaterThan(0);
        await page.keyboard.press('PageUp');
        await expect.poll(() => preview.evaluate(el => el.scrollTop)).toBeLessThan(before);
    });

    test('the line menu stays open while game output arrives, Escape closes only the menu', async ({page}) => {
        await login(page);
        await pushFiller(page, 'linia', 30);
        await openLogs(page);
        const preview = page.locator('#logs-preview');
        await expect(preview).toContainText('linia 29');

        await preview.getByText('linia 29').click({button: 'right'});
        const menu = page.locator('.logs-line-menu');
        await expect(menu).toBeVisible();

        await pushFiller(page, 'nowe', 20);
        await expect(page.locator('#main_text_output_msg_wrapper')).toContainText('nowe 19');
        await expect(menu).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(page.locator('#logs-modal')).toBeVisible();
    });

    test('search can be limited to the selected timeline range', async ({page}) => {
        await login(page);
        await pushText(page, 'wczesny TRAF');
        await pushFiller(page, 'a', 20);
        // Timestamps must differ for the range to split the two matches.
        await page.waitForTimeout(50);
        await pushText(page, 'pozny TRAF');

        await openLogs(page);
        const preview = page.locator('#logs-preview');
        await expect(preview).toContainText('pozny TRAF');
        await expect(page.locator('#logs-search-scope [data-scope="range"]')).toBeDisabled();

        // End the range on a line before the second match.
        await preview.getByText('a 19').click({button: 'right'});
        await page.locator('.logs-line-menu').getByText('Zakoncz na tej linii').click();
        await expect(preview).not.toContainText('pozny TRAF');

        await page.locator('#logs-search-scope [data-scope="range"]').click();
        await page.fill('#logs-search-input', 'TRAF');
        await page.press('#logs-search-input', 'Enter');
        await expect(page.locator('.logs-search-result')).toHaveCount(1);
        await expect(page.locator('.logs-search-summary')).toContainText('w zakresie');
        await expect(page.locator('#logs-preview .logs-preview-highlight')).toContainText('wczesny TRAF');

        // The whole log again finds both.
        await page.locator('#logs-search-scope [data-scope="session"]').click();
        await expect(page.locator('.logs-search-result')).toHaveCount(2);
    });

    test('dragging across the timeline selects a range', async ({page}) => {
        await login(page);
        await pushText(page, 'poczatek');
        // Timestamps need a spread for the timeline to show.
        await page.waitForTimeout(1200);
        await pushFiller(page, 'linia', 20);

        await openLogs(page);
        const track = page.locator('.logs-timeline-track');
        await expect(track).toBeVisible();
        await expect(page.locator('.logs-timeline-range')).toHaveText('Caly log');
        await expect(page.locator('.logs-timeline-viewport')).toBeVisible();

        const box = (await track.boundingBox())!;
        await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, {steps: 5});
        await page.mouse.up();

        await expect(page.locator('.logs-timeline-range')).toContainText('Wyczysc');
        await expect(page.locator('#logs-download')).toHaveText('Pobierz zakres');
    });
});
