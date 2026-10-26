import {createRequire} from 'node:module';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, submitCommand, waitForCharacter, waitForCommandInput} from './support/mocks';

const require = createRequire(import.meta.url);

/** A Mudlet Database_boxestwo.db: every form scripts.boxes saves a deposit in, plus a bank it does not know. */
async function mudletDepositDb(): Promise<Buffer> {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run('CREATE TABLE boxes (_row_id INTEGER PRIMARY KEY, character TEXT, bank TEXT, type INTEGER, box TEXT, updated TEXT, room_id INTEGER, changed TEXT)');
    const rows: [string, string, string][] = [
        ['Importer', 'ebino', 'Twoj depozyt zawiera dwie zlote monety i stalowy miecz'],
        ['Importer', 'novigrad', 'trzy srebrne monety'],
        ['Importer', 'wyzima', 'Twoj depozyt jest pusty'],
        ['Importer', 'atlantyda', 'miecz'],
        ['Inny', 'rinde', 'Nie posiadasz wykupionego depozytu'],
    ];
    for (const r of rows) db.run('INSERT INTO boxes (character, bank, box, room_id) VALUES (?, ?, ?, -1)', r);
    const bytes = db.export();
    db.close();
    return Buffer.from(bytes);
}

test('imports Mudlet deposits into the Depozyty window', async ({page}) => {
    test.slow();
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'Importer', object_num: 70201});
    await waitForCharacter(page, 'Importer');

    await submitCommand(page, '/depozytyw');
    const win = page.locator('.deposits-popup').first();
    await expect(win, 'should open the deposits window').toBeVisible();
    await win.getByRole('button', {name: 'Import', exact: true}).click();

    const row = page.locator('#settings-modal #import-depozyty');
    await expect(row, 'should open the import page on the Depozyty row').toBeVisible();
    await page.setInputFiles('#settings-modal #import-depozyty input[type="file"]', {
        name: 'Database_boxestwo.db',
        mimeType: 'application/x-sqlite3',
        buffer: await mudletDepositDb(),
    });
    await expect(row, 'should match the Mudlet character to the logged-in one').toContainText('Importer — 3 depozyty: ebino, novigrad, wyzima');
    await expect(row, 'should import an unknown Mudlet character under its lower-case name').toContainText('inny — 1 depozyt: rinde');
    await expect(row, 'should name the skipped bank').toContainText('Pominięte nieznane banki: atlantyda.');
    await row.getByRole('button', {name: 'Importuj'}).click();
    await expect(row, 'should report the import').toContainText('Zaimportowano 4 depozyty (Importer, inny).');

    await page.locator('#settings-modal .app-modal__close').first().click();
    await expect(win, 'should show the imported items').toContainText('stalowy miecz');
    await expect(win, 'should show every imported bank').toContainText('Depozyty (3)');

    // The other Mudlet character went to its own deposits.
    await pushGmcp(page, 'char.info', {name: 'inny', object_num: 70202});
    await waitForCharacter(page, 'inny');
    await expect(win, 'should switch to the other character\'s deposits').toContainText('Depozyty (1)');
    await expect(win, 'should keep the "no deposit" bank').toContainText('brak depozytu');
});
