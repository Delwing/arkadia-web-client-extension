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

async function save(page: Page, name: string) {
    await page.keyboard.press('Control+s');
    await expect(page.locator('#status-text')).toHaveText(`Saved: ${name}`);
}

test('Plugin editor opens single clicks in a preview tab', async ({page}) => {
    await newPlugin(page, 'Preview Test');
    await addFile(page, 'a.ts', 'export const a = 1\n');
    await addFile(page, 'b.ts', 'export const b = 1\n');
    await page.locator('.editor-tab[data-path="a.ts"]').click({button: 'middle'});
    await page.locator('.editor-tab[data-path="b.ts"]').click({button: 'middle'});

    const tab = (path: string) => page.locator(`.editor-tab[data-path="${path}"]`);

    // A single click previews; the next one replaces it
    await page.click('.file-item[data-path="a.ts"]');
    await expect(tab('a.ts')).toHaveClass(/preview/);
    await page.click('.file-item[data-path="b.ts"]');
    await expect(tab('a.ts')).toHaveCount(0);
    await expect(tab('b.ts')).toHaveClass(/preview/);

    // A double click keeps it
    await page.dblclick('.file-item[data-path="b.ts"]');
    await expect(tab('b.ts')).not.toHaveClass(/preview/);

    // So does editing
    await page.click('.file-item[data-path="a.ts"]');
    await expect(tab('a.ts')).toHaveClass(/preview/);
    await page.locator('.editor-group.active .view-lines').click();
    await page.keyboard.type('// edited\n');
    await expect(tab('a.ts')).not.toHaveClass(/preview/);
    await expect(page.locator('.editor-tab')).toHaveCount(3);

    // With previews off, clicks open tabs for good
    await page.click('#settings-btn');
    await page.locator('label:has(#preview-tabs-toggle)').click();
    await page.keyboard.press('Escape');
    await page.locator('.editor-tab[data-path="index.ts"]').click({button: 'middle'});
    await page.click('.file-item[data-path="index.ts"]');
    await expect(tab('index.ts')).not.toHaveClass(/preview/);
});

test('Plugin editor keeps saved versions and compares them across reloads', async ({page}) => {
    await newPlugin(page, 'History Test');
    await addFile(page, 'a.ts', 'export const first = 1\n');
    await save(page, 'History Test');

    await page.locator('.editor-group.active .view-lines').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('export const second = 2\n');
    await save(page, 'History Test');

    // Unsaved edit, then compare with the saved version
    await page.keyboard.type('export const unsaved = 3\n');
    await page.locator('.editor-tab[data-path="a.ts"]').click({button: 'right'});
    await page.locator('.editor-tab-menu .context-menu-item', {hasText: 'Compare with Saved'}).click();
    const view = page.locator('#compare-view');
    await expect(view).toBeVisible();
    await expect(page.locator('#compare-subtitle')).toHaveText('the saved version ↔ the file now');
    await expect(page.locator('.compare-version')).toHaveCount(2);
    await expect(page.locator('.compare-version').first()).toContainText('Last saved');

    // Restore the first version, then undo it
    await page.locator('.compare-version').nth(1).click();
    await page.click('#compare-restore-btn');
    await expect(page.locator('#compare-subtitle')).toContainText('(no differences)');
    await expect(page.locator('#status-text')).toContainText('Ctrl+Z undoes it');
    await page.keyboard.press('Escape');
    await expect(view).toBeHidden();
    await expect(page.locator('.editor-group.active .view-lines')).not.toContainText('second');
    await page.keyboard.press('Control+z');
    await expect(page.locator('.editor-group.active .view-lines')).toContainText('unsaved');
    await save(page, 'History Test');

    // The history outlives the page
    await page.reload();
    await expect(page.locator('.editor-tab').first()).toBeVisible({timeout: 30000});
    await page.click('.file-item[data-path="a.ts"]', {button: 'right'});
    await page.click('#context-menu [data-action="history"]');
    await expect(view).toBeVisible();
    await expect(page.locator('.compare-version')).toHaveCount(3);
    await expect(page.locator('.compare-version.selected'), 'history opens on the latest version that differs')
        .not.toContainText('Last saved');

    // A lower limit drops older versions
    await page.click('#compare-close-btn');
    await page.click('#settings-btn');
    await page.fill('#history-versions-input', '1');
    await page.press('#history-versions-input', 'Enter');
    await page.keyboard.press('Escape');
    await page.click('.file-item[data-path="a.ts"]', {button: 'right'});
    await page.click('#context-menu [data-action="history"]');
    await expect(page.locator('.compare-version')).toHaveCount(1);
});
