import {expect, test} from './support/fixtures';
import {waitForCommandInput} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const SCRIPTS_BUTTON = '#scripts-button';
const SCRIPTS_MODAL = '#scripts-modal';
const SCRIPT_INPUT_PLACEHOLDER = 'URL skryptu';

async function openScriptsModal(page) {
    await page.click(MENU_BUTTON);
    await page.click(SCRIPTS_BUTTON);
    const modal = page.locator(SCRIPTS_MODAL);
    await expect(modal, 'should show scripts modal').toBeVisible();
    return modal;
}

test('Pasted plugin code can be opened and edited in the plugin editor', async ({page, context}) => {
    const pluginCode = `export async function init() {
  const marker = 'wklejony-marker';
  return {name: 'Wklejony Test', version: '0.0.1', author: 'QA', description: marker};
}`;

    await page.goto('/');
    await waitForCommandInput(page);

    const scriptsModal = await openScriptsModal(page);
    await scriptsModal.getByRole('button', {name: 'Wklej kod'}).click();

    const codeDialog = page.locator('.modal', {hasText: 'Dodaj plugin z kodu'}).last();
    await codeDialog.getByPlaceholder('Moja wtyczka').fill('Wklejony Test');
    await codeDialog.getByPlaceholder('export async function init(api) { ... }').fill(pluginCode);
    await codeDialog.getByRole('button', {name: 'Dodaj plugin'}).click();

    const pastedItem = scriptsModal.locator('section', {hasText: 'Wklejony Test'});
    await expect(pastedItem, 'should list the pasted plugin').toBeVisible();

    const editButton = pastedItem.getByTitle('Edytuj w edytorze');
    const [editorPage] = await Promise.all([
        context.waitForEvent('page'),
        editButton.click(),
    ]);

    await editorPage.waitForLoadState('domcontentloaded');

    await expect(
        editorPage.locator('#plugin-name'),
        'editor should open the pasted plugin, not report it as missing',
    ).toHaveValue('Wklejony Test', {timeout: 30000});
    await expect(
        editorPage.locator('#editor-container .view-lines'),
        'editor should show the pasted source',
    ).toContainText('wklejony-marker', {timeout: 30000});

    await editorPage.close();
});

test('Scripts tab manages URLs, reflects plugin lifecycle, and cleans up storage', async ({page}) => {
    const primaryUrl = 'https://example.com/plugin.js';
    const secondaryUrl = 'https://example.com/other.js';

    await page.route(`${primaryUrl}**`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `export async function init() { return { name: 'Test Plugin', version: '1.2.3', author: 'QA', description: 'Lifecycle check' }; }`,
        });
    });

    await page.route(`${secondaryUrl}**`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `export async function init() { throw new Error('Initialization failed'); }`,
        });
    });

    await page.goto('/');
    await waitForCommandInput(page);

    let scriptsModal = await openScriptsModal(page);

    const scriptInput = scriptsModal.getByPlaceholder(SCRIPT_INPUT_PLACEHOLDER);
    const addButton = scriptsModal.getByRole('button', {name: 'Dodaj'});

    await scriptInput.fill(primaryUrl);
    await addButton.click();

    await expect(
        scriptsModal.locator('section', {hasText: primaryUrl}),
        'should display script added with button',
    ).toBeVisible();
    await expect(scriptsModal.getByText('Test Plugin'), 'should render loaded plugin name').toBeVisible();
    await expect(scriptsModal.getByText('v1.2.3'), 'should render loaded plugin version badge').toBeVisible();
    await expect(scriptsModal.getByText('Lifecycle check'), 'should render plugin description').toBeVisible();

    await scriptInput.fill(secondaryUrl);
    await scriptInput.press('Enter');

    await expect(
        scriptsModal.locator('section', {hasText: secondaryUrl}),
        'should display script added with Enter key',
    ).toBeVisible();

    await page.waitForFunction(([first, second]) => {
        const stored = localStorage.getItem('scripts');
        if (!stored) return false;
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) && parsed.includes(first) && parsed.includes(second);
        } catch {
            return false;
        }
    }, [primaryUrl, secondaryUrl]);

    await page.reload();
    await waitForCommandInput(page);
    scriptsModal = await openScriptsModal(page);

    const primaryItem = scriptsModal.locator('section', {hasText: primaryUrl});
    const secondaryItem = scriptsModal.locator('section', {hasText: secondaryUrl});

    await expect(primaryItem, 'should persist primary script after reload').toBeVisible();
    await expect(secondaryItem, 'should persist secondary script after reload').toBeVisible();
    await expect(primaryItem.getByText('Test Plugin'), 'should render loaded plugin name').toBeVisible();
    await expect(primaryItem.getByText('v1.2.3'), 'should render loaded plugin version badge').toBeVisible();
    await expect(primaryItem.getByText('Lifecycle check'), 'should render plugin description').toBeVisible();

    await expect(
        secondaryItem.getByText('Init failed: Initialization failed'),
        'should show plugin error message for failed init',
    ).toBeVisible();
    await expect(secondaryItem.locator('.spinner-border'), 'should hide spinner on error').toHaveCount(0);

    await primaryItem.getByRole('button').click();
    await expect(primaryItem, 'should remove primary script entry').toHaveCount(0);

    await secondaryItem.getByRole('button').click();
    await expect(secondaryItem, 'should remove secondary script entry').toHaveCount(0);
    await expect(scriptsModal.locator('section.character-settings-section'), 'should clear scripts list after removals').toHaveCount(0);

    await page.waitForFunction(() => {
        const stored = localStorage.getItem('scripts');
        if (!stored) return false;
        try {
            const parsed = JSON.parse(stored);
            return Array.isArray(parsed) && parsed.length === 0;
        } catch {
            return false;
        }
    });
});
