import type {Page} from '@playwright/test';
import {expect, test} from './support/fixtures';

async function newPlugin(page: Page, name: string) {
    await page.goto('/editor/');
    await page.click('#welcome-new-btn');
    await page.fill('#new-plugin-name', name);
    await page.click('#new-plugin-create');
    await expect(page.locator('.editor-tab'), 'the entry file opens').toHaveCount(1, {timeout: 30000});
}

async function addFile(page: Page, path: string, text: string) {
    await page.click('#add-file-btn');
    await page.fill('#new-file-path', path);
    await page.click('#new-file-create');
    await expect(page.locator('.editor-tab.active')).toHaveAttribute('data-path', path);
    await page.locator('.editor-group.active .view-lines').click();
    await page.keyboard.type(text);
}

test('Plugin editor searches across files and replaces', async ({page}) => {
    await newPlugin(page, 'Search Test');
    await addFile(page, 'lib/one.ts', 'export const greeting = "hello"\n');
    await addFile(page, 'lib/two.ts', 'export const other = "hello there"\n');

    await page.keyboard.press('Control+Shift+F');
    await expect(page.locator('#search-input')).toBeFocused();
    await page.keyboard.type('hello');
    await expect(page.locator('#search-summary')).toHaveText('2 results in 2 files');
    await expect(page.locator('.search-file__name')).toHaveText(['one.ts', 'two.ts']);

    // A result opens its file with the match selected
    await page.locator('.search-match').first().click();
    await expect(page.locator('.editor-group.active .editor-tab.active')).toHaveAttribute('data-path', 'lib/one.ts');

    // Regex mode: a broken pattern says why, a valid one matches
    await page.click('[data-search-option="regex"]');
    await page.fill('#search-input', '(oops');
    await expect(page.locator('#search-summary')).toContainText('Unterminated group');
    await page.fill('#search-input', 'hel+o');
    await expect(page.locator('#search-summary')).toHaveText('2 results in 2 files');

    // Replace all, after confirming
    await page.fill('#replace-input', 'bye');
    await page.click('#replace-all-btn');
    await page.getByRole('button', {name: 'Replace', exact: true}).click();
    await expect(page.locator('#search-summary')).toHaveText('No results');
    await expect(page.locator('.editor-group.active .view-lines')).toContainText('"bye"');
    await expect(page.locator('.editor-tab[data-path="lib/two.ts"]'), 'replaced files read as modified').toHaveClass(/modified/);

    // Back to the files
    await page.keyboard.press('Control+Shift+E');
    await expect(page.locator('#file-list')).toBeVisible();
});

test('Plugin editor shows bundle errors in Problems and survives deleting the entry file', async ({page}) => {
    await newPlugin(page, 'Bundle Test');

    // A missing import fails the save; the error lands on its line
    await page.locator('.editor-group .view-lines').click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('import "./missing"\n');
    await page.keyboard.press('Control+s');
    await expect(page.locator('#status-text')).toContainText('Bundling failed');
    await page.click('#problems-btn');
    const row = page.locator('#problems-list .problem-row', {hasText: 'File not found: missing'});
    await expect(row).toBeVisible();
    await expect(row).toContainText('esbuild');
    await expect(row).toContainText('Ln 1, Col 8');

    // Fixing the line clears it
    await page.locator('.editor-group .view-lines').click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.press('Delete');
    await expect(row).toHaveCount(0);

    // Deleting the entry file while another is open: the plugin still saves
    await addFile(page, 'lib/util.ts', 'console.log("still here")\n');
    await page.click('.file-item[data-path="index.ts"]', {button: 'right'});
    await page.click('#context-menu [data-action="delete"]');
    await page.getByRole('button', {name: 'Delete', exact: true}).click();
    await expect(page.locator('.file-item[data-path="index.ts"]')).toHaveCount(0);
    await page.keyboard.press('Control+s');
    await expect(page.locator('#status-text')).toHaveText('Saved: Bundle Test');
});
