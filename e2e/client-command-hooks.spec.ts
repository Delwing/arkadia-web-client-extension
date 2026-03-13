import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    waitForCommandInput,
    submitCommand,
    getLastOutgoingCommand,
    primeCharInfo,
} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const SCRIPTS_BUTTON = '#scripts-button';
const SCRIPTS_MODAL = '#scripts-modal';
const SCRIPT_INPUT_PLACEHOLDER = 'URL skryptu';
const PLUGIN_URL = 'https://example.com/test-hook-plugin.js';

async function openScriptsModal(page) {
    await page.click(MENU_BUTTON);
    await page.click(SCRIPTS_BUTTON);
    const modal = page.locator(SCRIPTS_MODAL);
    await expect(modal, 'should show scripts modal').toBeVisible();
    return modal;
}

async function loadPlugin(page, body: string): Promise<void> {
    await page.route(`${PLUGIN_URL}**`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body,
        });
    });

    const modal = await openScriptsModal(page);
    const input = modal.getByPlaceholder(SCRIPT_INPUT_PLACEHOLDER);
    const addBtn = modal.getByRole('button', {name: 'Dodaj'});

    await input.fill(PLUGIN_URL);
    await addBtn.click();
    await expect(modal.getByText('Hook Test'), 'plugin should load and show its name').toBeVisible();

    // Close modal by pressing Escape — in the context of a modal this works
    // (Escape is only intercepted by command input when it has focus)
    await modal.locator('.btn-close').first().click();
    await expect(modal).not.toBeVisible();
}

async function removePlugin(page): Promise<void> {
    const modal = await openScriptsModal(page);
    const pluginItem = modal.locator('section', {hasText: PLUGIN_URL});
    await pluginItem.getByRole('button').click();
    await expect(pluginItem, 'plugin entry should be removed').toHaveCount(0);

    await modal.locator('.btn-close').first().click();
    await expect(modal).not.toBeVisible();
}

async function resetCommandLog(page): Promise<void> {
    await page.evaluate(() => {
        (window as any).__resetCommandLog?.();
    });
}

async function getCommandLog(page): Promise<string[]> {
    return page.evaluate(() => [...((window as any).__mockCommandLog ?? [])]);
}

const SINGLE_HOOK_PLUGIN_BODY = `
export async function init(api) {
    api.commandHooks.register((command) => {
        if (command === 'ping') return 'pong';
        if (command === 'secret') return null;
        return undefined;
    });
    return { name: 'Hook Test', version: '1.0.0' };
}`;

test.describe('Command hooks via plugin API', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page);
    });

    test('hook modifies command — ping becomes pong', async ({page}) => {
        await loadPlugin(page, SINGLE_HOOK_PLUGIN_BODY);

        await resetCommandLog(page);
        await submitCommand(page, 'ping');

        await expect.poll(
            async () => await getLastOutgoingCommand(page),
            {message: 'server should receive the modified command'},
        ).toBe('pong');
    });

    test('hook suppresses command — secret is never sent', async ({page}) => {
        await loadPlugin(page, SINGLE_HOOK_PLUGIN_BODY);

        await resetCommandLog(page);
        await submitCommand(page, 'secret');
        await page.waitForTimeout(300);

        const log = await getCommandLog(page);
        expect(log.length, 'no command should have been sent to server').toBe(0);
    });

    test('hook passes through unknown commands unchanged', async ({page}) => {
        await loadPlugin(page, SINGLE_HOOK_PLUGIN_BODY);

        await resetCommandLog(page);
        await submitCommand(page, 'hello');

        await expect.poll(
            async () => await getLastOutgoingCommand(page),
            {message: 'server should receive the original command unchanged'},
        ).toBe('hello');
    });

    test('hook is cleaned up after plugin removal — commands pass through normally', async ({page}) => {
        await loadPlugin(page, SINGLE_HOOK_PLUGIN_BODY);

        // Confirm hook is active before removal
        await resetCommandLog(page);
        await submitCommand(page, 'ping');
        await expect.poll(
            async () => await getLastOutgoingCommand(page),
            {message: 'hook should be active before removal'},
        ).toBe('pong');

        // Remove the plugin
        await removePlugin(page);

        // After removal, ping should go through as-is (not transformed)
        await resetCommandLog(page);
        await submitCommand(page, 'ping');
        await expect.poll(
            async () => await getLastOutgoingCommand(page),
            {message: 'after removal, command should pass through without modification'},
        ).toBe('ping');

        // After removal, secret should also be sent (not suppressed)
        await resetCommandLog(page);
        await submitCommand(page, 'secret');
        await expect.poll(
            async () => await getLastOutgoingCommand(page),
            {message: 'after removal, previously-suppressed command should be sent normally'},
        ).toBe('secret');
    });
});