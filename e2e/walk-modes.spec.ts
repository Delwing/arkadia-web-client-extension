import {expect, test} from './support/fixtures';
import {ensureGameSocket, getLastOutgoingCommand, waitForCommandInput} from './support/mocks';
import {captureKey, closeKeysWindow, openKeysWindow} from './support/keys';
import type {Page} from '@playwright/test';

/**
 * Walk modes: in Klawisze each mode gets a modifier, and that modifier held
 * with a direction key walks the step in the mode (Alt+Num8 → przemknij n).
 */

async function resetCommands(page: Page): Promise<void> {
    await page.evaluate(() => (window as any).__resetCommandLog?.());
}

function walkModifier(page: Page, mode: string, mod: string) {
    return page.locator(`#binds-modal [data-walk="${mode}"] [data-mod="${mod}"]`);
}

test.describe('Walk modes', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('Alt set for Przemknij makes Alt+numpad sneak', async ({page}) => {
        await openKeysWindow(page);
        const alt = walkModifier(page, 'sneak', 'alt');
        await expect(alt).toBeVisible();
        await alt.click();
        await expect(alt).toHaveClass(/is-on/);
        await closeKeysWindow(page);

        await resetCommands(page);
        await page.locator('#message-input').focus();
        await page.keyboard.down('Alt');
        await page.keyboard.press('Numpad8');
        await page.keyboard.up('Alt');
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('przemknij n');

        // A plain press still walks plainly.
        await resetCommands(page);
        await page.keyboard.press('Numpad8');
        await expect.poll(() => getLastOutgoingCommand(page), {timeout: 3000}).toBe('n');
    });

    test('a modifier the directions already use is locked', async ({page}) => {
        await openKeysWindow(page);
        await expect(walkModifier(page, 'sneak', 'shift')).toBeEnabled();
        await captureKey(page, 'slot:directions.n', 'Shift+ArrowUp');
        await expect(walkModifier(page, 'sneak', 'shift')).toBeDisabled();
        await expect(walkModifier(page, 'sneak', 'alt')).toBeEnabled();
    });

    test('two modes on one modifier are flagged', async ({page}) => {
        await openKeysWindow(page);
        await walkModifier(page, 'sneak', 'alt').click();
        await walkModifier(page, 'sneakTeam', 'alt').click();
        await expect(page.locator('#binds-modal [data-walk-clash="sneak"]')).toContainText('Przemknij z drużyną');
        await expect(walkModifier(page, 'sneak', 'alt')).toHaveClass(/is-conflict/);
    });
});
