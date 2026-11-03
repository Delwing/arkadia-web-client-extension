import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

// Logi → Zarządzaj: picking logs by date range, exporting them as HTML, TXT
// and JSON, archiving (export, then a confirmed delete), and importing the
// archive back.

const DAY = 24 * 60 * 60 * 1000;

/**
 * Without a save picker, as in Firefox and Safari: the archive is a download.
 * (Chromium's would open a native dialog the test cannot answer.)
 */
async function withoutSavePicker(page: Page): Promise<void> {
    await page.addInitScript(() => {
        (window as unknown as {showSaveFilePicker?: unknown}).showSaveFilePicker = undefined;
    });
}

/** A save picker that hands the page a file which keeps what is written to it. */
async function withFakeSavePicker(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as {showSaveFilePicker: unknown; __saved?: {name: string; size: number}};
        w.showSaveFilePicker = async (options: {suggestedName?: string}) => {
            const name = options.suggestedName ?? 'logi.zip';
            let size = 0;
            return {
                name,
                createWritable: async () => ({
                    write: async (blob: Blob) => {
                        size += blob.size;
                    },
                    close: async () => {
                        w.__saved = {name, size};
                    },
                }),
            };
        };
    });
}

async function login(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'Tester', object_num: 12345});
    await waitForCharacter(page, 'Tester');
    await pushText(page, 'Krasnolud pilnuje magazynu.');
}

/** Old logs, as a long-standing player has them: `daysAgo` each, two records apiece. */
async function seedOldLogs(page: Page, daysAgo: number[]): Promise<string[]> {
    return page.evaluate(async ({daysAgo, day}) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ArkadiaLogsDB', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const names: string[] = [];
        const tx = db.transaction('records', 'readwrite');
        for (const ago of daysAgo) {
            const start = Date.now() - ago * day;
            const name = `session_${start}`;
            names.push(name);
            tx.objectStore('records').put({text: `STARY_LOG ${ago} dni temu`, timestamp: start}, [name, 0]);
            tx.objectStore('records').put({text: '<span>druga linia</span>', timestamp: start + 1000}, [name, 1]);
        }
        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        db.close();
        return names;
    }, {daysAgo, day: DAY});
}

async function openManager(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await expect(page.locator('#logs-modal .lv')).toBeVisible();
    await page.getByRole('button', {name: /Zarządzaj/}).click();
    await expect(page.getByText('Zarządzanie logami')).toBeVisible();
}

const rows = (page: Page) => page.locator('.logs-manage__table tbody tr[data-session]');

test('old logs are picked by range, archived as a ZIP, deleted on confirmation and imported back', async ({page}) => {
    await withoutSavePicker(page);
    await login(page);
    const old = await seedOldLogs(page, [40, 100]);
    await openManager(page);

    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('.logs-manage__live')).toHaveCount(1);

    // The range shows and selects the old logs only, never the live one.
    await page.locator('#logs-manage-range').selectOption('older30');
    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator('.logs-manage__summary-selected')).toContainText('Zaznaczone: 2');

    await page.locator('#logs-manage-export').click();
    await page.locator('#logs-export-txt').check();
    await expect(page.locator('#logs-export-html')).toBeChecked();
    await expect(page.locator('#logs-export-json')).toBeChecked();
    await page.locator('#logs-export-archive').check();

    const download = page.waitForEvent('download');
    await page.locator('#logs-export-run').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^logi_archiwum_\d{4}-\d{2}-\d{2}\.zip$/);
    const zip = await JSZip.loadAsync(await readFile((await file.path())!));
    const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort();
    expect(names).toEqual(
        ['html', 'json', 'txt'].flatMap((format) => old.map((name) => `${format}/${name}.${format}`)).sort(),
    );
    const text = await zip.file(`txt/${old[0]}.txt`)!.async('string');
    expect(text).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} STARY_LOG 40 dni temu\n.* druga linia\n$/);

    // A download cannot be confirmed: nothing is deleted until the player says it was saved.
    await expect(page.getByText('Usunąć pobrane logi z przeglądarki?')).toBeVisible();
    await expect(page.getByText(/nie może\s+sprawdzić/)).toBeVisible();
    await page.locator('#logs-archive-delete').click();
    await expect(page.locator('.logs-manage__status')).toContainText('Zarchiwizowano 2 logów');
    await page.locator('#logs-manage-range').selectOption('all');
    await expect(rows(page)).toHaveCount(1);

    // The archive comes back in through Importuj.
    await page.locator('.logs-manage__file').setInputFiles((await file.path())!);
    await expect(page.locator('.logs-manage__status')).toContainText('Zaimportowano 2 sesji');
    await expect(rows(page)).toHaveCount(3);
});

test('each log shows what it was downloaded as, and the list filters by it', async ({page}) => {
    await withoutSavePicker(page);
    await login(page);
    const [old] = await seedOldLogs(page, [10]);
    await openManager(page);

    await page.locator('#logs-manage-range').selectOption('last30');
    // The live log is not part of a range selection.
    await expect(page.locator('.logs-manage__summary-selected')).toContainText('Zaznaczone: 1');
    // The column is as wide as three badges before and after: the window keeps its size.
    const pobrano = page.locator('.logs-manage__table th').nth(5);
    const width = await pobrano.evaluate((th) => th.getBoundingClientRect().width);

    await page.locator('#logs-manage-export').click();
    await page.locator('#logs-export-json').uncheck();
    const download = page.waitForEvent('download');
    await page.locator('#logs-export-run').click();
    expect((await download).suggestedFilename()).toMatch(/^logi_\d{4}-\d{2}-\d{2}\.zip$/);
    await expect(page.locator('.logs-manage__status')).toContainText('Pobrano');

    const row = page.locator(`tr[data-session="${old}"]`);
    await expect(row.locator('.logs-manage__badge[data-empty="false"]')).toHaveText(['HTML']);
    expect(await pobrano.evaluate((th) => th.getBoundingClientRect().width)).toBe(width);

    await page.locator('#logs-manage-filter').selectOption('json');
    await expect(row).toBeVisible();
    await page.locator('#logs-manage-filter').selectOption('html');
    await expect(row).toHaveCount(0);
});

test('a size is shown for each log, and the selection adds them up', async ({page}) => {
    await login(page);
    const [old] = await seedOldLogs(page, [5]);
    await openManager(page);

    await expect(page.locator(`tr[data-session="${old}"] td`).nth(4)).toHaveText(/^~[\d,]+ kB$/);
    await page.locator('#logs-manage-range').selectOption('last7');
    await expect(page.locator('.logs-manage__summary-selected')).toHaveText(/Zaznaczone: 1 · ~[\d,]+ kB/);
});

test('without persistent storage Zarządzaj explains how this browser grants it', async ({page}) => {
    await login(page);
    await openManager(page);

    const notice = page.locator('.persistence-notice');
    // Headless Chromium does not keep a page's data for good unless asked.
    if (await page.evaluate(() => navigator.storage.persisted())) {
        await expect(notice).toHaveCount(0);
        return;
    }
    await expect(notice).toContainText('Pamięć nietrwała');
    await notice.getByRole('button', {name: /Jak to włączyć w: Chrome/}).click();
    await expect(notice.locator('.persistence-notice__steps li').first()).toContainText('Zainstaluj');
});

test('with a save picker the archive is written by the client, so it is known to be saved', async ({page}) => {
    await withFakeSavePicker(page);
    await login(page);
    await seedOldLogs(page, [50]);
    await openManager(page);

    await page.locator('#logs-manage-range').selectOption('older30');
    await page.locator('#logs-manage-export').click();
    // Formats are cards: one click on the card turns one on or off.
    await page.locator('.logs-export__format[data-format="txt"]').click();
    await expect(page.locator('.logs-export__format[data-format="txt"]')).toHaveAttribute('data-on', 'true');
    await page.locator('#logs-export-archive').check();
    await page.locator('#logs-export-run').click();

    await expect(page.getByText('Plik zapisany. Usunąć logi z przeglądarki?')).toBeVisible();
    const saved = await page.evaluate(() => (window as unknown as {__saved?: {name: string; size: number}}).__saved);
    expect(saved?.name).toMatch(/^logi_archiwum_\d{4}-\d{2}-\d{2}\.zip$/);
    expect(saved?.size).toBeGreaterThan(0);

    await page.locator('#logs-archive-delete').click();
    await expect(page.locator('.logs-manage__status')).toContainText('Zarchiwizowano 1 logów');
});

test('deleting a log leaves Zarządzaj and the viewer where they are, without reloading', async ({page}) => {
    await login(page);
    const [first] = await seedOldLogs(page, [20, 60]);
    await openManager(page);
    await expect(rows(page)).toHaveCount(3);

    // Watch for the manager leaving the page or the viewer's loading screen showing, even for a frame.
    await page.evaluate(() => {
        const w = window as unknown as {__blinks: string[]};
        w.__blinks = [];
        const dialog = [...document.querySelectorAll('[role="dialog"]')].find((el) => el.textContent?.includes('Zarządzanie logami'));
        new MutationObserver(() => {
            if (dialog && !dialog.isConnected) w.__blinks.push('manager removed');
            if (document.querySelector('.logs-browser__loading')) w.__blinks.push('loading screen');
            if (document.querySelector('.logs-manage__empty')) w.__blinks.push('empty list');
        }).observe(document.body, {childList: true, subtree: true});
    });

    await page.locator(`tr[data-session="${first}"] input`).check();
    await page.getByRole('button', {name: 'Usuń (1)'}).click();
    await page.getByRole('dialog').getByRole('button', {name: 'Usuń', exact: true}).click();

    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator(`tr[data-session="${first}"]`)).toHaveCount(0);
    // Long enough for the quiet listing behind it to have finished.
    await expect(page.locator('.lv-session')).toHaveCount(2);
    expect(await page.evaluate(() => (window as unknown as {__blinks: string[]}).__blinks)).toEqual([]);
});
