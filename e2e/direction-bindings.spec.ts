import {expect, test} from './support/fixtures';
import {ensureGameSocket, getLastOutgoingCommand, pushText, submitCommand, waitForCommandInput} from './support/mocks';
import {closeKeysWindow, openKeysMenu, openKeysWindow} from './support/keys';
import type {Page} from '@playwright/test';

async function pressNumpadKey(page: Page, code: string): Promise<void> {
    await page.keyboard.down(code);
    await page.keyboard.up(code);
}

/**
 * Playwright's numpad is a numpad with NumLock off: its `Numpad8` reports
 * `key: "ArrowUp"`. A digit with NumLock on goes in through Chromium's input
 * pipeline instead, the way the OS hands it over.
 */
async function pressNumpadNumLockOn(page: Page, code: string, digit: string): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    const keyCode = 96 + Number(digit);
    const base = {code, key: digit, text: digit, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, location: 3};
    await cdp.send('Input.dispatchKeyEvent', {type: 'rawKeyDown', ...base});
    await cdp.send('Input.dispatchKeyEvent', {type: 'keyUp', ...base});
    await cdp.detach();
}

async function resetCommands(page: Page): Promise<void> {
    await page.evaluate(() => {
        const globalScope = window as any;
        if (typeof globalScope.__resetCommandLog === 'function') {
            globalScope.__resetCommandLog();
        }
    });
}

test.describe('Direction key bindings', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    const DEFAULT_BINDINGS: [string, string][] = [
        ['Numpad8', 'n'],
        ['Numpad2', 's'],
        ['Numpad4', 'w'],
        ['Numpad6', 'e'],
        ['Numpad7', 'nw'],
        ['Numpad9', 'ne'],
        ['Numpad1', 'sw'],
        ['Numpad3', 'se'],
        ['NumpadMultiply', 'u'],
        ['NumpadDivide', 'd'],
    ];

    for (const [code, direction] of DEFAULT_BINDINGS) {
        test(`${code} sends "${direction}"`, async ({page}) => {
            await resetCommands(page);

            await page.locator('#message-input').focus();
            await pressNumpadKey(page, code);

            const lastCommand = await getLastOutgoingCommand(page);
            expect(lastCommand).toBe(direction);
        });
    }

    test('Numpad5 sends "zerknij"', async ({page}) => {
        await resetCommands(page);
        await page.locator('#message-input').focus();
        await pressNumpadKey(page, 'Numpad5');

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand).toBe('zerknij');
    });

    test('Numpad5 halts the carriage while it is rolling, and looks again once it stops', async ({page}) => {
        await pushText(page, 'Siadasz na nieduzym jednokonnym wozie.');
        await pushText(page, 'Nieduzy jednokonny woz rusza na zachod.');

        await resetCommands(page);
        await page.locator('#message-input').focus();
        await pressNumpadKey(page, 'Numpad5');
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('zatrzymaj woz');

        await pushText(page, 'Nieduzy jednokonny woz zatrzymuje sie.');
        await resetCommands(page);
        await pressNumpadKey(page, 'Numpad5');
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('zerknij');
    });

    test('the mobile "zerknij" button halts the carriage and looks again once it stops', async ({page}) => {
        const zerknijButton = page.locator('#mobile-direction-buttons #c-button');
        await expect(zerknijButton).toBeVisible();

        await pushText(page, 'Siadasz na nieduzym jednokonnym wozie.');
        await pushText(page, 'Nieduzy jednokonny woz rusza na zachod.');

        await resetCommands(page);
        await zerknijButton.click();
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('zatrzymaj woz');

        await pushText(page, 'Nieduzy jednokonny woz zatrzymuje sie.');
        await resetCommands(page);
        await zerknijButton.click();
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('zerknij');
    });

    test('direction keys do NOT fire when a modal is open', async ({page}) => {
        await resetCommands(page);

        // Open options modal via the menu dropdown
        await page.click('#menu-button');
        await page.click('#settings-button');
        await page.waitForSelector('.app-modal:not([hidden])', {timeout: 5000});

        await pressNumpadKey(page, 'Numpad8');
        // Short wait to confirm no command was sent while modal is open (negative assertion)
        await page.waitForTimeout(200);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand).toBeNull();

        // Close modal
        await page.keyboard.press('Escape');
    });

    test('direction keys do NOT fire when a different input has focus', async ({page}) => {
        await resetCommands(page);

        // Add a temporary input element and focus it
        await page.evaluate(() => {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'test-other-input';
            document.body.appendChild(input);
            input.focus();
        });

        await pressNumpadKey(page, 'Numpad8');
        // Short wait to confirm no command was sent with other input focused (negative assertion)
        await page.waitForTimeout(200);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand).toBeNull();

        // Cleanup
        await page.evaluate(() => {
            document.getElementById('test-other-input')?.remove();
        });
    });

    test('direction keys DO fire when #message-input has focus', async ({page}) => {
        await resetCommands(page);

        await page.locator('#message-input').focus();
        await pressNumpadKey(page, 'Numpad6');

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand).toBe('e');
    });

    test('with NumLock off, Num8 still walks north and leaves the command history alone', async ({page}) => {
        await submitCommand(page, 'sz');
        const input = page.locator('#message-input');
        await input.fill('');
        await resetCommands(page);

        await input.focus();
        await pressNumpadKey(page, 'Numpad8');
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('n');
        await expect(input).toHaveValue('');

        // Num2 is ArrowDown: it must not clear what is being typed.
        await input.fill('zerk');
        await pressNumpadKey(page, 'Numpad2');
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('s');
        await expect(input).toHaveValue('zerk');
    });

    test('with "Rozróżniaj NumLock" on, NumLock-off Num8 is free: no step, history up', async ({page}) => {
        await openKeysWindow(page);
        await openKeysMenu(page);
        await page.locator('#binds-modal button[title="Rozróżniaj NumLock"]').click();
        await openKeysMenu(page);
        await expect(page.locator('#binds-modal button[title="Rozróżniaj NumLock"]')).toHaveClass(/is-on/);
        await openKeysMenu(page); // the ⋯ button toggles the menu shut
        await closeKeysWindow(page);

        await submitCommand(page, 'sz');
        const input = page.locator('#message-input');
        await input.fill('');
        await resetCommands(page);

        await input.focus();
        await pressNumpadKey(page, 'Numpad8');
        await expect(input).toHaveValue('sz');
        expect(await getLastOutgoingCommand(page)).toBeNull();

        // NumLock on: still the north key, and no digit lands in the field.
        await pressNumpadNumLockOn(page, 'Numpad8', '8');
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('n');
        await expect(input).toHaveValue('sz');
    });
});
