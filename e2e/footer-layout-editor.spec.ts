import {expect, test} from './support/fixtures';
import type {FrameLocator, Locator, Page} from '@playwright/test';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

/**
 * The footer layout editor: "Dostosuj…" opens a preset in a dialog over the
 * settings, the footer drawn live to click and drag; "Gotowe" makes it the
 * player's own layout, saved with the settings.
 */

async function start(page: Page): Promise<void> {
    await page.setViewportSize({width: 1400, height: 950});
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {id: 1, exits: ['polnoc']});
    await pushGmcp(page, 'char.state', {hp: 6, fatigue: 2, stuffed: 1, mana: 3});
}

interface Editor {
    modal: Locator;
    dialog: Locator;
    preview: FrameLocator;
}

/** The settings, with the editor open on the Arkadia layout. */
async function editArkadia(page: Page): Promise<Editor> {
    const modal = await openSettings(page, 'ui-footer');
    await modal.locator('#ui-footer-layout').selectOption('arkadia');
    await modal.locator('#ui-footer-customize').click();
    const dialog = page.locator('.footer-editor-dialog');
    await expect(dialog).toBeVisible();
    const preview = dialog.frameLocator('.footer-editor__frame');
    await expect(preview.locator('[data-fl-frame="1.0"]')).toBeVisible();
    return {modal, dialog, preview};
}

const frame = (editor: Editor, path: string) => editor.preview.locator(`[data-fl-frame="${path}"]`);

/** Where a piece is once the preview has settled (fonts, chips coming in). */
async function steadyBox(locator: Locator): Promise<{x: number; y: number; width: number; height: number}> {
    let last = '';
    await expect.poll(async () => {
        const box = await locator.boundingBox();
        const now = JSON.stringify(box);
        const steady = box !== null && now === last;
        last = now;
        return steady;
    }, {intervals: [150]}).toBe(true);
    return (await locator.boundingBox())!;
}

async function centre(locator: Locator): Promise<{x: number; y: number}> {
    const box = await steadyBox(locator);
    return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

async function dragTo(page: Page, from: {x: number; y: number}, to: {x: number; y: number}): Promise<void> {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y, {steps: 3});
    await page.mouse.move(to.x, to.y, {steps: 12});
    await page.mouse.up();
}

test.describe('Footer layout editor', () => {
    test('a piece clicked in the preview can be taken out, and the footer follows once saved', async ({page}) => {
        await start(page);
        const editor = await editArkadia(page);

        await frame(editor, '1.0').click();
        await expect(frame(editor, '1.0')).toHaveClass(/is-selected/);
        await expect(editor.dialog.locator('#fle-props')).toContainText('Róża kierunków');
        await editor.dialog.locator('#fle-remove').click();
        await expect(editor.preview.locator('.footer-compass')).toHaveCount(0);
        await editor.dialog.locator('#fle-done').click();
        await expect(editor.dialog).toHaveCount(0);
        await expect(editor.modal.locator('#ui-footer-layout')).toHaveValue('custom');
        await saveSettings(page);

        await expect(page.locator('#char-state .status-vitals--grid')).toBeVisible();
        await expect(page.locator('.footer-compass')).toHaveCount(0);
    });

    test('a piece dragged into another band joins it', async ({page}) => {
        await start(page);
        const editor = await editArkadia(page);
        const binds = await steadyBox(frame(editor, '0'));

        await dragTo(page, await centre(frame(editor, '1.0')), {x: binds.x + binds.width * 0.6, y: binds.y + binds.height / 2});
        await expect(frame(editor, '0.1')).toHaveClass(/is-selected/);
        await expect(editor.dialog.locator('#fle-props')).toContainText('Róża kierunków');
        await editor.dialog.locator('#fle-done').click();
        await saveSettings(page);

        await expect(page.locator('#multi-binds .footer-compass')).toBeVisible();
    });

    test('a piece dropped on the bottom edge of a band gets a band of its own', async ({page}) => {
        await start(page);
        const editor = await editArkadia(page);
        const status = await steadyBox(frame(editor, '1'));

        await dragTo(page, await centre(frame(editor, '1.0')), {x: status.x + status.width / 2, y: status.y + status.height - 2});
        await expect(editor.preview.locator('[data-fl-frame="2"]')).toBeVisible();
        await expect(frame(editor, '2.0')).toHaveClass(/is-selected/);
        await expect(editor.dialog.locator('#fle-props')).toContainText('Róża kierunków');
    });

    test('a piece from the palette dropped onto the footer is added there', async ({page}) => {
        await start(page);
        const editor = await editArkadia(page);
        const vitals = await steadyBox(frame(editor, '1.1'));

        await dragTo(page, await centre(editor.dialog.locator('#fle-add-chips')), {x: vitals.x + vitals.width - 4, y: vitals.y + vitals.height / 2});
        await expect(frame(editor, '1.2')).toHaveClass(/is-selected/);
        await expect(editor.dialog.locator('#fle-props')).toContainText('Plakietki – wybrane (0)');
        await editor.dialog.locator('#fl-chip-lamp-timer').check();
        await editor.dialog.locator('#fle-done').click();
        await saveSettings(page);

        await expect(page.locator('#char-state .footer-strip #lamp-timer')).toBeVisible();
        await expect(page.locator('#footer-chips #lamp-timer')).toHaveCount(0);
        await expect(page.locator('#footer-chips #pipe-status')).toBeVisible();
    });

    test('the handle between two pieces sets their width shares', async ({page}) => {
        await start(page);
        const editor = await editArkadia(page);
        const handle = editor.preview.locator('[data-fl-handle="1.1|1.2"]');
        const from = await centre(handle);

        await dragTo(page, from, {x: from.x - 150, y: from.y});
        await editor.dialog.locator('#fle-export').click();
        const layout = JSON.parse(await editor.dialog.locator('#fle-json').inputValue());
        const [, vitals, chips] = layout.bands[1].children;
        expect(vitals.grow + chips.grow).toBe(86);
        expect(vitals.grow).toBeLessThan(40);
    });

    test('a layout comes in as JSON, and nonsense is turned away', async ({page}) => {
        await start(page);
        const editor = await editArkadia(page);

        await editor.dialog.locator('#fle-import-open').click();
        await editor.dialog.locator('#fle-json').fill('{ nope');
        await editor.dialog.locator('#fle-import').click();
        await expect(editor.dialog).toContainText('To nie jest poprawny JSON.');

        await editor.dialog.locator('#fle-json').fill(JSON.stringify({
            bands: [{children: [
                {type: 'block', block: 'vitals'},
                {type: 'block', block: 'chips', items: 'rest', arrange: 'wrap'},
                {type: 'block', block: 'teleport'},
            ]}],
        }));
        await editor.dialog.locator('#fle-import').click();
        await expect(editor.preview.locator('[data-fl-frame]')).toHaveCount(3);
        await expect(editor.dialog).toContainText('Brak paska multibindów.');
        await editor.dialog.locator('#fle-done').click();
        await saveSettings(page);

        await expect(page.locator('#multi-binds')).toHaveCount(0);
        await expect(page.locator('#char-state #footer-chips')).toBeAttached();
    });

    test('the own layout outlives a reload, reopens for editing, and goes back to its preset', async ({page}) => {
        await start(page);
        let editor = await editArkadia(page);
        await frame(editor, '1.0').click();
        await editor.dialog.locator('#fle-remove').click();
        await editor.dialog.locator('#fle-done').click();
        await saveSettings(page);

        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await expect(page.locator('#char-state .status-vitals--grid')).toBeVisible();
        await expect(page.locator('.footer-compass')).toHaveCount(0);

        const modal = await openSettings(page, 'ui-footer');
        await expect(modal.locator('#ui-footer-layout')).toHaveValue('custom');
        await modal.locator('#ui-footer-edit').click();
        editor = {modal, dialog: page.locator('.footer-editor-dialog'), preview: page.locator('.footer-editor-dialog').frameLocator('.footer-editor__frame')};
        await expect(frame(editor, '1.0')).toBeVisible();
        await expect(editor.preview.locator('.footer-compass')).toHaveCount(0);
        await editor.dialog.getByRole('button', {name: 'Anuluj'}).click();

        await modal.locator('#ui-footer-restore').click();
        await saveSettings(page);
        await expect(page.locator('#char-state .footer-compass')).toBeVisible();
    });

    test('in forge the preview is drawn on the plate', async ({page}) => {
        await page.setViewportSize({width: 1400, height: 950});
        await page.goto('/forge-ui/');
        await page.locator('.gate__close').click();
        await page.locator('.forge-menu__button').click();
        await page.locator('.forge-menu__list').getByRole('button', {name: 'Interfejs'}).click();
        const modal = page.locator('.forge-menu-modal');
        await modal.locator('.settings-dialog__nav-item[data-settings-category="ui-footer"]').click();
        await modal.locator('#ui-footer-layout').selectOption('forge');
        await modal.locator('#ui-footer-customize').click();

        const preview = page.locator('.footer-editor-dialog').frameLocator('.footer-editor__frame');
        await expect(preview.locator('.hud-panel .multibind-strip')).toBeVisible();
        await expect(preview.locator('[data-fl-frame="1.0"]')).toBeVisible();
    });

    test('the preview stays put whatever the settings under it take', async ({page}) => {
        await start(page);
        const editor = await editArkadia(page);
        const top = async () => (await steadyBox(editor.dialog.locator('.footer-editor__frame'))).y;
        const before = await top();

        await frame(editor, '1.2').click(); // the chips: the most settings
        expect(await top()).toBe(before);
        await frame(editor, '0').click(); // a band: hardly any
        expect(await top()).toBe(before);
        await frame(editor, '1.1').click();
        expect(await top()).toBe(before);
    });
});
