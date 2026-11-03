import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

// Logi → Zarządzaj: picking logs by date range, exporting them as HTML, TXT
// and JSON, archiving (export, then a confirmed delete), and importing the
// archive back.

const DAY = 24 * 60 * 60 * 1000;

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

    // Nothing is deleted until the player says the file was saved.
    await expect(page.getByText('Usunąć pobrane logi z przeglądarki?')).toBeVisible();
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
    await login(page);
    const [old] = await seedOldLogs(page, [10]);
    await openManager(page);

    await page.locator('#logs-manage-range').selectOption('last30');
    // The live log is not part of a range selection.
    await expect(page.locator('.logs-manage__summary-selected')).toContainText('Zaznaczone: 1');

    await page.locator('#logs-manage-export').click();
    await page.locator('#logs-export-json').uncheck();
    const download = page.waitForEvent('download');
    await page.locator('#logs-export-run').click();
    expect((await download).suggestedFilename()).toMatch(/^logi_\d{4}-\d{2}-\d{2}\.zip$/);
    await expect(page.locator('.logs-manage__status')).toContainText('Pobrano');

    const row = page.locator(`tr[data-session="${old}"]`);
    await expect(row.locator('.logs-manage__badge')).toHaveText(['HTML']);

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
