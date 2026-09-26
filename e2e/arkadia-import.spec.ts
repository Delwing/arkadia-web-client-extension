import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getLastOutgoingCommand, pushText, resetCommandLog, submitCommand, waitForCommandInput} from './support/mocks';
import {openSettings} from './support/settings';

const IMPORT_ROW = '#settings-modal #import-arkadia';

const FILE = {
    name: 'arkadia.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
        aliases: {zz: 'zabij zbira'},
        patterns: [
            {Regexp: 'szary wilk', Replacement: 'WILK', Color: '#ff0000'},
            {Regexp: 'mowi (\\w+)', Replacement: 'gada $0'},
        ],
    })),
};

async function pickFile(page: Page) {
    await page.setInputFiles(`${IMPORT_ROW} input[type="file"]`, FILE);
}

test('reads the Arkadia client file, lets the user pick parts and imports them', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    await openSettings(page, 'data-import');
    const importRow = page.locator(IMPORT_ROW);
    await expect(importRow, 'should show one row for the Arkadia client file').toBeVisible();

    await pickFile(page);
    const aliases = importRow.getByLabel('Aliasy (1)');
    const patterns = importRow.getByLabel(/Przekształcanie tekstu \(1\)/);
    await expect(aliases, 'should offer the aliases found in the file').toBeChecked();
    await expect(patterns, 'should offer the importable text transformations').toBeChecked();

    const importButton = importRow.getByRole('button', {name: 'Importuj'});
    await aliases.uncheck();
    await patterns.uncheck();
    await expect(importButton, 'should not import with nothing picked').toBeDisabled();
    await patterns.check();
    await importButton.click();

    const message = importRow.locator('.import-row__message');
    await expect(message, 'should report the imported transformations').toContainText('Zaimportowano 1 przekształceń');
    await expect(message, 'should name the skipped transformation').toContainText('mowi (\\w+)');
    await expect(message, 'should leave the unpicked aliases alone').not.toContainText('aliasów');

    await pickFile(page);
    await importRow.getByRole('button', {name: 'Importuj'}).click();
    await expect(message, 'should add the aliases on the second pass').toContainText('Zaimportowano 1 aliasów.');
    await expect(message, 'should not import the same transformation twice').toContainText('Brak nowych przekształceń.');

    await page.locator('#settings-modal .app-modal__close').first().click();

    await pushText(page, 'Widzisz szary wilk tutaj.');
    const replaced = page.locator('#main_text_output_msg_wrapper span', {hasText: /^WILK$/}).last();
    await expect(replaced, 'should rewrite the match in the game output').toBeVisible();
    await expect(replaced, 'should colour the rewritten text').toHaveCSS('color', 'rgb(255, 0, 0)');

    await resetCommandLog(page);
    await submitCommand(page, 'zz');
    await expect.poll(() => getLastOutgoingCommand(page), {message: 'should run the imported alias'}).toBe('zabij zbira');
});
