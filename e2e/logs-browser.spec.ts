import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, submitCommand, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

// The Logi window is the shared @ui/logViewer in a design-system Dialog, so
// the hooks below are the viewer's own (`.lv-*`), not the old browser's ids.
// What is asserted is the behaviour, which did not change.

const DIALOG = '.logs-dialog';
const PANE = '.lv-log';
const CURRENT_ROW = '.lv-log__row[data-current="true"]';
const COUNTER = '.lv-search__count';
const SEARCH = '#lv-search';

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
    await expect(page.locator(DIALOG), 'logs window should open').toBeVisible({timeout: 5000});
    await expect(page.locator(PANE), 'the log pane should render').toBeVisible({timeout: 5000});
}

/** The scope buttons are a Segmented control, addressed by their label. */
function scope(page: Page, label: 'Ten log' | 'Wszystkie logi' | 'Zakres') {
    return page.locator('.ark-segmented__item').filter({hasText: label}).first();
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
async function currentRowInView(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const pane = document.querySelector('.lv-log');
        const row = pane?.querySelector('.lv-log__row[data-current="true"]');
        if (!pane || !row) return false;
        const p = pane.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        return r.top >= p.top && r.bottom <= p.bottom;
    });
}

test.describe('Logi browser', () => {
    test('a match in another log is reached in one step', async ({page}) => {
        // Session 1: two matches, each buried under enough lines that neither
        // can be reached without a real scroll.
        await login(page);
        await pushText(page, 'Stara sesja: SZUKANY_ZNACZNIK pierwszy');
        await pushFiller(page, 'stara', 150);
        await pushText(page, 'Stara sesja: SZUKANY_ZNACZNIK drugi');
        await pushFiller(page, 'stara-b', 150);

        // Reloading starts a new session, which the browser opens by default —
        // it is the one being recorded, and it opens at its end.
        await login(page);
        await pushFiller(page, 'nowa', 50);

        await openLogs(page);
        await expect(page.locator(PANE)).toContainText('nowa 49');
        await expect(page.locator('.lv-session')).toHaveCount(2);

        await scope(page, 'Wszystkie logi').click();
        await page.fill(SEARCH, 'SZUKANY_ZNACZNIK');
        // Nothing matches in the open log, and the sub-line says where it does.
        await expect(page.locator(COUNTER)).toHaveText('Brak trafien tutaj');
        await expect(page.locator('.lv-search__sub')).toHaveText('2 w 1 logu');

        // One Enter crosses into the other session AND lands on the hit. This
        // used to need a second press: two scroll effects fired on the same
        // render and "start this session at the top" ran last.
        await page.press(SEARCH, 'Enter');
        await expect(page.locator(COUNTER)).toHaveText('1 z 2');
        await expect(page.locator(CURRENT_ROW)).toContainText('SZUKANY_ZNACZNIK pierwszy');
        await expect.poll(() => currentRowInView(page)).toBe(true);

        // Scroll right away from it; one step must still land on the next hit,
        // whose offset is only an estimate until the rows above it are measured.
        await page.locator(PANE).hover();
        await page.mouse.wheel(0, 100000);
        await expect.poll(() => currentRowInView(page)).toBe(false);
        await page.press(SEARCH, 'Enter');
        await expect(page.locator(CURRENT_ROW)).toContainText('SZUKANY_ZNACZNIK drugi');
        await expect.poll(() => currentRowInView(page)).toBe(true);
    });

    test('Enter steps through results and wraps around', async ({page}) => {
        await login(page);
        await pushText(page, 'pierwszy TRAF');
        await pushFiller(page, 'a', 40);
        await pushText(page, 'drugi TRAF');
        await pushFiller(page, 'b', 40);

        await openLogs(page);
        const input = page.locator(SEARCH);
        await input.fill('TRAF');
        await expect(page.locator(COUNTER)).toHaveText('1 z 2');
        await input.press('Enter');
        await expect(page.locator(COUNTER)).toHaveText('2 z 2');
        await expect(page.locator(CURRENT_ROW)).toContainText('drugi TRAF');
        await input.press('Enter');
        await expect(page.locator(COUNTER)).toHaveText('1 z 2');
        await expect(page.locator('.lv-search__sub')).toHaveText('Przewinieto do pierwszego trafienia');
        await input.press('Shift+Enter');
        await expect(page.locator(COUNTER)).toHaveText('2 z 2');
    });

    test('Page Up scrolls the pane', async ({page}) => {
        await login(page);
        await pushFiller(page, 'linia', 200);
        await openLogs(page);
        const pane = page.locator(PANE);
        await expect(pane).toContainText('linia 199');

        // The viewer's shortcuts are scoped to its own subtree, and it ignores
        // keys typed into the search field, so focus has to be in the pane.
        await pane.click({position: {x: 10, y: 10}});
        const before = await pane.evaluate(el => el.scrollTop);
        expect(before).toBeGreaterThan(0);
        await page.keyboard.press('PageUp');
        await expect.poll(() => pane.evaluate(el => el.scrollTop)).toBeLessThan(before);
    });

    test('the line menu stays open while game output arrives, Escape closes only the menu', async ({page}) => {
        await login(page);
        await pushFiller(page, 'linia', 30);
        await openLogs(page);
        const pane = page.locator(PANE);
        await expect(pane).toContainText('linia 29');

        await pane.getByText('linia 29').click({button: 'right'});
        const menu = page.locator('.lv-line-menu');
        await expect(menu).toBeVisible();

        await pushFiller(page, 'nowe', 20);
        await expect(page.locator('#main_text_output_msg_wrapper')).toContainText('nowe 19');
        await expect(menu).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(page.locator(DIALOG), 'the window itself must survive it').toBeVisible();
    });

    test('search can be limited to the selected timeline range', async ({page}) => {
        await login(page);
        await pushText(page, 'wczesny TRAF');
        await pushFiller(page, 'a', 20);
        // Timestamps must differ for the range to split the two matches.
        await page.waitForTimeout(50);
        await pushText(page, 'pozny TRAF');

        await openLogs(page);
        const pane = page.locator(PANE);
        await expect(pane).toContainText('pozny TRAF');
        await expect(scope(page, 'Zakres')).toBeDisabled();

        // End the range on a line before the second match. Selecting a range
        // switches the search into it on its own.
        await pane.getByText('a 19').click({button: 'right'});
        await page.locator('.lv-line-menu').getByText('Zakoncz na tej linii').click();
        await expect(pane).not.toContainText('pozny TRAF');
        await expect(scope(page, 'Zakres')).toHaveAttribute('data-state', 'on');
        await expect(page.locator('.lv-range-chip')).toHaveAttribute('data-active', 'true');

        await page.fill(SEARCH, 'TRAF');
        await expect(page.locator(COUNTER)).toHaveText('1 z 1');
        await expect(page.locator(CURRENT_ROW)).toContainText('wczesny TRAF');

        // The whole log again finds both, and stops applying the range.
        await scope(page, 'Ten log').click();
        await expect(page.locator(COUNTER)).toHaveText('1 z 2');
        await expect(pane).toContainText('pozny TRAF');
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

        const box = (await track.boundingBox())!;
        await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, {steps: 5});
        await page.mouse.up();

        await expect(page.locator('.lv-range-chip')).toBeVisible();
        // Every export now works on the range, and says so.
        await expect(page.getByRole('button', {name: 'Eksport zakresu'})).toBeVisible();
    });

    test('the game, the client and System get separate channels', async ({page}) => {
        // `other` is Arkadia's catch-all, `mud` is raw text arriving outside
        // GMCP framing, an unrecognized type is still the game talking, and a
        // line with no type at all was printed by the client. All four used to
        // land in System together with `system.login`, which is what made the
        // script prints invisible. The counts are the assertion: this is the
        // only test that runs the whole path, from MudClient through the
        // logger to the viewer.
        await login(page);
        await pushText(page, 'Krasnolud mowi: Piwa mi nalej!', {type: 'comm'});
        await pushText(page, 'Witaj ponownie w Arkadii.', {type: 'system.login'});
        await pushText(page, 'Pozostaly komunikat gry.', {type: 'other'});
        await pushText(page, 'Surowy tekst z ekranu logowania.', {type: 'mud'});
        await pushText(page, 'Typ ktorego jeszcze nie skladamy.', {type: 'zupelnie.nowy'});
        // `/labirynt` is a client-side alias answering with `client.println` —
        // the path every script, plugin and `printLine` takes. It prints three
        // lines (a blank one either side of the text).
        await submitCommand(page, '/labirynt');

        await openLogs(page);
        const channels = page.locator('.lv-channels');
        await expect(channels).toBeVisible();

        const count = (label: string) =>
            channels.locator('button').filter({hasText: label}).first();

        await expect(count('System'), 'only the login banner is System').toHaveText(/System\s*1$/);
        await expect(count('Inne'), 'other + mud + the unrecognized type').toHaveText(/Inne\s*3$/);
        await expect(count('Skrypty'), 'the three lines of the alias reply').toHaveText(/Skrypty\s*3$/);

        // Hiding Skrypty must take the script's lines and nothing else.
        await count('Skrypty').click();
        await expect(page.locator('.lv-log')).toContainText('Pozostaly komunikat gry.');
        await expect(page.locator('.lv-log')).not.toContainText('Tryb labiryntu');
    });

    test('the ZIP archive carries readable HTML', async ({page}) => {
        // The exported file wraps its lines in `#logs-preview` and used to
        // borrow that element's rules off the live page. Nothing carries that
        // id any more, so the frame comes from `collectLogStyles()` itself —
        // and if it ever stops, the archive still builds and still opens, it
        // just loses its monospace column. Which is exactly the kind of break
        // no other test would notice.
        await login(page);
        await pushText(page, 'Linia ktora ma trafic do archiwum');

        await openLogs(page);
        await page.getByRole('button', {name: 'Zarzadzanie'}).click();
        await expect(page.locator('.logs-manage')).toBeVisible();

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', {name: 'Pobierz wszystkie'}).click(),
        ]);
        const zipPath = await download.path();
        expect(download.suggestedFilename()).toMatch(/^logi_\d{4}-\d{2}-\d{2}\.zip$/);

        const {default: JSZip} = await import('jszip');
        const {readFile} = await import('node:fs/promises');
        const zip = await JSZip.loadAsync(await readFile(zipPath!));
        const names = Object.keys(zip.files);
        expect(names).toHaveLength(1);
        const html = await zip.files[names[0]].async('string');

        expect(html).toContain('Linia ktora ma trafic do archiwum');
        expect(html).toContain('id="logs-preview"');
        expect(html, 'the frame must travel with the file').toContain('font-family: monospace');
    });

    test('sessions can be deleted from the management window', async ({page}) => {
        await login(page);
        await pushText(page, 'Sesja do usuniecia');

        await openLogs(page);
        await expect(page.locator('.lv-session')).toHaveCount(1);

        await page.getByRole('button', {name: 'Zarzadzanie'}).click();
        const manage = page.locator('.logs-manage');
        await expect(manage).toBeVisible();
        await expect(manage.locator('tbody tr:not(.logs-manage__year)')).toHaveCount(1);

        await manage.locator('tbody tr:not(.logs-manage__year)').first().click();
        await manage.getByRole('button', {name: /^Usun \(1\)$/}).click();
        await page.getByRole('button', {name: 'Usun', exact: true}).click();

        await expect(manage.locator('tbody tr:not(.logs-manage__year)')).toHaveCount(0);
    });
});
