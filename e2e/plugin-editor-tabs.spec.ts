import path from 'node:path';
import {expect, test} from './support/fixtures';

// The editor loads esbuild's wasm from unpkg; serve the installed copy instead.
const ESBUILD_WASM = path.resolve('node_modules/esbuild-wasm/esbuild.wasm');

test.beforeEach(async ({page}) => {
    await page.route(/unpkg\.com\/esbuild-wasm@[^/]+\/esbuild\.wasm/, route =>
        route.fulfill({path: ESBUILD_WASM, contentType: 'application/wasm'}));
});

test('Plugin editor opens files in tabs, splits, and lists problems', async ({page}) => {
    await page.goto('/editor/');
    await page.click('#welcome-new-btn');
    await page.fill('#new-plugin-name', 'Tabs Test');
    await page.click('#new-plugin-create');

    const tabs = page.locator('.editor-tab');
    await expect(tabs, 'the entry file opens in a tab').toHaveCount(1, {timeout: 30000});

    // A type error in the entry file
    await page.locator('.editor-group .view-lines').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nconst broken: number = "text"\n');

    // A second file opens as a second tab
    await page.click('#add-file-btn');
    await page.fill('#new-file-path', 'lib/util.ts');
    await page.click('#new-file-create');
    await expect(tabs).toHaveCount(2);
    await expect(page.locator('.editor-tab.active')).toHaveAttribute('data-path', 'lib/util.ts');
    await page.locator('.editor-group .view-lines').click();
    await page.keyboard.type('export const value: string = 5\n');

    // Clicking the counts opens the problems list, grouped by file
    await page.click('#problems-btn');
    const panel = page.locator('#problems-panel');
    await expect(panel).toBeVisible();
    // Both files have errors, so they list in path order
    await expect(panel.locator('.problems-file__name'), 'both files list their errors')
        .toHaveText(['index.ts', 'util.ts'], {timeout: 20000});

    // Clicking a problem opens its file at the spot
    await panel.locator('.problem-row', {hasText: "Type 'string' is not assignable"}).click();
    await expect(page.locator('.editor-group.active .editor-tab.active')).toHaveAttribute('data-path', 'index.ts');
    await expect(page.locator('#cursor-position')).toContainText('Ln ');

    // Split: the same file opens in a second group
    await page.locator('.editor-split-btn').click();
    const groups = page.locator('.editor-group');
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(1).locator('.editor-tab.active')).toHaveAttribute('data-path', 'index.ts');

    // Closing the last tab of the second group closes the split
    await groups.nth(1).locator('.editor-tab.active .editor-tab__close').click();
    await expect(groups).toHaveCount(1);

    // Middle click closes a tab
    await page.locator('.editor-tab[data-path="lib/util.ts"]').click({button: 'middle'});
    await expect(tabs).toHaveCount(1);
});
