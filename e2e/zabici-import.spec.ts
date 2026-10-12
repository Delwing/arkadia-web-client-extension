import {createRequire} from 'node:module';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, getRecentOutput, pushGmcp, pushText, submitCommand, waitForCharacter, waitForCommandInput, waitForOutputContaining} from './support/mocks';

const require = createRequire(import.meta.url);

/** A Mudlet Database_counterdaysum.db: day sums per character and mob, plus Mudlet's daily "all" rows. */
async function mudletKillDb(): Promise<Buffer> {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE counter2_daysum (_row_id INTEGER PRIMARY KEY, year INTEGER, month INTEGER, day INTEGER, type TEXT, character TEXT, amount INTEGER)');
    const rows: [number, string, string, string, string, number][] = [
        [2024, '05', '09', 'orka', 'Importer', 4],
        [2024, '05', '09', 'Bergmunda', 'Importer', 1],
        [2024, '05', '09', 'all', 'Importer', 5],
        [2025, '01', '02', 'trolla', 'Importer', 2],
        [2025, '01', '02', 'goblina', 'Inny', 9],
    ];
    for (const r of rows) db.run('INSERT INTO counter2_daysum (year, month, day, type, character, amount) VALUES (?, ?, ?, ?, ?, ?)', r);
    const bytes = db.export();
    db.close();
    return Buffer.from(bytes);
}

test('imports Mudlet lifetime kills into the Zabici window', async ({page}) => {
    test.slow();
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'Importer', object_num: 70101});
    await waitForCharacter(page, 'Importer');
    await pushText(page, 'Zabiles orka.');
    await waitForOutputContaining(page, 'Zabiles orka');

    await submitCommand(page, '/zabici2w');
    const win = page.locator('.zabici2-popup').first();
    await expect(win, 'should open the lifetime kills window').toBeVisible();
    await win.getByRole('button', {name: 'Import', exact: true}).click();

    const row = page.locator('#settings-modal #import-zabici');
    await expect(row, 'should open the import page on the Zabici row').toBeVisible();
    await page.setInputFiles('#settings-modal #import-zabici input[type="file"]', {
        name: 'Database_counterdaysum.db',
        mimeType: 'application/x-sqlite3',
        buffer: await mudletKillDb(),
    });
    await expect(row, 'should match the Mudlet character to the logged-in one').toContainText('Importer — 7 zabitych z 2 dni');
    await expect(row, 'should import an unknown Mudlet character under its lower-case name').toContainText('inny — 9 zabitych z 1 dnia');
    await row.getByRole('button', {name: 'Importuj'}).click();
    await expect(row, 'should report the import').toContainText('Zaimportowano 16 zabitych (Importer, inny).');

    await page.locator('#settings-modal .app-modal__close').first().click();
    // Closing the settings dialog closes open windows too; open it again.
    await submitCommand(page, '/zabici2w');
    await expect(win.locator('.kill-list__footer'), 'max mode keeps the higher orka count for the day').toContainText('Łącznie 8');
    await expect(win.locator('.kill-list__row--unique'), 'should list the imported unique kill').toContainText('Bergmunda');
    await expect(win.locator('.kill-list__row').filter({hasText: 'orka'}), 'should add today\'s kill to the imported ones').toContainText('5');

    // The other Mudlet character went to its own counter.
    await pushGmcp(page, 'char.info', {name: 'inny', object_num: 70102});
    await waitForCharacter(page, 'inny');
    await submitCommand(page, '/zabici2');
    await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');
    expect(await getRecentOutput(page, 15), 'should list the other character\'s imported kills').toMatch(/goblina.*9/);
});
