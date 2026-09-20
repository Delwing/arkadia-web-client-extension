import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

// Selectors follow the shared viewer (`src/ui/logViewer`), which replaced the
// in-client browser's own markup. The behaviours checked here are unchanged;
// only the names are. `.lv-log` is the scrolling pane (was `#logs-preview`),
// `#lv-search` the query field, `.lv-search__count` the "3 z 128" counter and
// `.lv-track` the timeline.

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
    // The browser mounts with the modal and reads every session before it can
    // render anything.
    await expect(page.locator('.lv')).toBeVisible();
}

/** Pushes `count` filler lines, each long enough to wrap in the pane on some rows. */
async function pushFiller(page: Page, prefix: string, count: number): Promise<void> {
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
        lines.push(`${prefix} ${i} ` + 'krasnolud patrzy podejrzliwie '.repeat(i % 7 === 0 ? 12 : 1));
    }
    await pushText(page, lines.join('\n'));
}

/** True when the current match sits inside the pane's visible area. */
async function activeLineInView(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const pane = document.querySelector('.lv-log');
        if (!pane) return false;
        const line = pane.querySelector('.lv-log__row[data-current="true"]');
        if (!line) return false;
        const p = pane.getBoundingClientRect();
        const r = line.getBoundingClientRect();
        return r.top >= p.top && r.bottom <= p.bottom;
    });
}

const scopeButton = (page: Page, label: string) =>
    page.locator('.lv-segmented__item', {hasText: label});

test.describe('Logi browser', () => {
    test('a match in another session is reached, and shown, in one step', async ({page}) => {
        // Session 1: the match, followed by enough lines that it is far from the end.
        await login(page);
        await pushText(page, 'Stara sesja: SZUKANY_ZNACZNIK tutaj');
        await pushFiller(page, 'stara', 300);

        // Reloading starts a new session, which the browser opens by default.
        await login(page);
        await pushFiller(page, 'nowa', 50);

        await openLogs(page);
        await expect(page.locator('.lv-log')).toContainText('nowa 49');

        // The match is in the other log, so the search has to look at all of them.
        await scopeButton(page, 'Wszystkie logi').click();
        await page.fill('#lv-search', 'SZUKANY_ZNACZNIK');
        // The sidebar badges the session that holds it, and says how many.
        await expect(page.locator('.lv-session .lv-badge')).toHaveText('1');
        await expect(page.locator('.lv-search__sub')).toHaveText('1 w 1 logu');

        // One Enter crosses into that session, announces the jump and lands on
        // the match — it must not leave the player at the top of the new log.
        await page.press('#lv-search', 'Enter');
        await expect(page.locator('.lv-log__row[data-current="true"]')).toContainText('SZUKANY_ZNACZNIK');
        await expect(page.locator('.lv-search__sub[data-notice="true"]')).toContainText('Dalej w');
        await expect.poll(() => activeLineInView(page)).toBe(true);

        // Scroll away, then a single step must bring it back.
        await page.locator('.lv-log').hover();
        await page.mouse.wheel(0, 100000);
        await expect.poll(() => activeLineInView(page)).toBe(false);
        await page.press('#lv-search', 'Enter');
        await expect.poll(() => activeLineInView(page)).toBe(true);
    });

    test('Enter steps through results and wraps around', async ({page}) => {
        await login(page);
        await pushText(page, 'pierwszy TRAF');
        await pushFiller(page, 'a', 40);
        await pushText(page, 'drugi TRAF');
        await pushFiller(page, 'b', 40);

        await openLogs(page);
        const input = page.locator('#lv-search');
        await input.fill('TRAF');
        const position = page.locator('.lv-search__count');
        await expect(position).toHaveText('1 z 2');
        await input.press('Enter');
        await expect(position).toHaveText('2 z 2');
        await expect(page.locator('.lv-log__row[data-current="true"]')).toContainText('drugi TRAF');
        await input.press('Enter');
        await expect(position).toHaveText('1 z 2');
        await input.press('Shift+Enter');
        await expect(position).toHaveText('2 z 2');
    });

    test('Page Up scrolls the pane', async ({page}) => {
        await login(page);
        await pushFiller(page, 'linia', 200);
        await openLogs(page);
        const pane = page.locator('.lv-log');
        await expect(pane).toContainText('linia 199');

        const before = await pane.evaluate(el => el.scrollTop);
        expect(before).toBeGreaterThan(0);
        await page.locator('.lv').click({position: {x: 5, y: 5}});
        await page.keyboard.press('PageUp');
        await expect.poll(() => pane.evaluate(el => el.scrollTop)).toBeLessThan(before);
    });

    test('the line menu stays open while game output arrives, Escape closes only the menu', async ({page}) => {
        await login(page);
        await pushFiller(page, 'linia', 30);
        await openLogs(page);
        const pane = page.locator('.lv-log');
        await expect(pane).toContainText('linia 29');

        await pane.getByText('linia 29', {exact: false}).first().click({button: 'right'});
        const menu = page.locator('.lv-line-menu');
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
        const pane = page.locator('.lv-log');
        await expect(pane).toContainText('pozny TRAF');
        await expect(scopeButton(page, 'Zakres')).toBeDisabled();

        // End the range on a line before the second match.
        await pane.getByText('a 19', {exact: false}).first().click({button: 'right'});
        await page.locator('.lv-line-menu').getByText('Zakoncz na tej linii').click();
        await expect(pane).not.toContainText('pozny TRAF');

        // A range narrows the search to itself, without being asked twice.
        await expect(scopeButton(page, 'Zakres')).toHaveAttribute('data-state', 'on');
        await page.fill('#lv-search', 'TRAF');
        await expect(page.locator('.lv-search__count')).toHaveText('1 z 1');
        await expect(page.locator('.lv-log__row[data-current="true"]')).toContainText('wczesny TRAF');

        // The whole log again finds both.
        await scopeButton(page, 'Ten log').click();
        await expect(page.locator('.lv-search__count')).toHaveText('1 z 2');
    });

    test('dragging across the timeline selects a range', async ({page}) => {
        await login(page);
        await pushText(page, 'poczatek');
        // Timestamps need a spread for the timeline to show.
        await page.waitForTimeout(1200);
        await pushFiller(page, 'linia', 20);

        await openLogs(page);
        const track = page.locator('.lv-track');
        await expect(track).toBeVisible();
        await expect(page.locator('.lv-range-chip')).toHaveCount(0);
        await expect(page.locator('.lv-track__viewport')).toBeVisible();

        const box = (await track.boundingBox())!;
        await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, {steps: 5});
        await page.mouse.up();

        await expect(page.locator('.lv-range-chip')).toBeVisible();
        await expect(page.locator('.lv-range-chip')).toContainText('zakres');
        // The export offer follows the range, so a saved file cannot claim to
        // hold the whole log while holding a slice.
        await expect(page.getByTitle('Zapisz zaznaczony zakres')).toHaveText('Eksport zakresu');
    });

    test('the export menu still saves HTML, text and an image', async ({page}) => {
        await login(page);
        await pushFiller(page, 'linia', 30);
        await openLogs(page);
        await expect(page.locator('.lv-log')).toContainText('linia 29');

        const formats: [label: string, suffix: string][] = [
            ['Pobierz HTML', '.html'],
            ['Pobierz tekst (.txt)', '.txt'],
            ['Pobierz jako obraz', '.png'],
        ];
        for (const [label, suffix] of formats) {
            await page.getByTitle('Zapisz caly log').click();
            const waitDownload = page.waitForEvent('download');
            await page.locator('.lv-menu__item', {hasText: label}).click();
            const download = await waitDownload;
            expect(download.suggestedFilename(), label).toContain(suffix);
        }
    });

    test('an empty store still offers a way out of itself', async ({page}) => {
        await login(page);
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                const request = indexedDB.deleteDatabase('ArkadiaMessagesDB');
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
            });
        });
        await page.reload();
        await waitForCommandInput(page);
        await openLogs(page);

        // The chrome renders whether or not there is anything to read: the old
        // early return replaced the whole viewer with "Brak zapisanych sesji."
        // and took the import button away with it.
        await expect(page.locator('.lv__header')).toBeVisible();
        await expect(page.locator('.lv-sidebar')).toBeVisible();
        await expect(page.locator('#logs-modal')).not.toContainText('Brak zapisanych sesji.');

        const importButton = page.getByRole('button', {name: 'Zaimportuj logi z pliku'});
        await expect(importButton).toBeVisible();
        await importButton.click();
        await expect(page.getByText('Zarzadzanie logami')).toBeVisible();
    });
});
