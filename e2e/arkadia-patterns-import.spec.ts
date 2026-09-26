import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';
import {openSettings} from './support/settings';

const IMPORT_ROW = '#settings-modal #import-patterns-arkadia';

test('imports the Arkadia client text transformations as working triggers', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    await openSettings(page, 'data-import');
    await expect(page.locator(IMPORT_ROW), 'should show the text transformations import row').toBeVisible();
    const file = {
        name: 'arkadia.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({
            aliases: {},
            patterns: [
                {Regexp: 'szary wilk', Replacement: 'WILK', Color: '#ff0000'},
                {Regexp: 'mowi (\\w+)', Replacement: 'gada $0'},
            ],
        })),
    };
    await page.setInputFiles(`${IMPORT_ROW} input[type="file"]`, file);
    const message = page.locator(`${IMPORT_ROW} .import-row__message`);
    await expect(message, 'should report the import').toContainText('Zaimportowano 1 przekształceń');
    await expect(message, 'should name the rule it skipped').toContainText('mowi (\\w+)');

    await page.setInputFiles(`${IMPORT_ROW} input[type="file"]`, file);
    await expect(message, 'should not import the same rule twice')
        .toContainText('Brak nowych przekształceń.');

    await page.locator('#settings-modal .app-modal__close').first().click();
    await pushText(page, 'Widzisz szary wilk tutaj.');
    const replaced = page.locator('#main_text_output_msg_wrapper span', {hasText: /^WILK$/}).last();
    await expect(replaced, 'should rewrite the match in the game output').toBeVisible();
    await expect(replaced, 'should colour the rewritten text').toHaveCSS('color', 'rgb(255, 0, 0)');
});
