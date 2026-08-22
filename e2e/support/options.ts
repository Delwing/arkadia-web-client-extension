import { expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/**
 * Helpers for driving the settings modal.
 *
 * Settings are always changed through this UI in e2e tests — never by writing to
 * localStorage. See the Testing Philosophy in e2e/CLAUDE.md.
 */

const MENU_BUTTON = '#menu-button';
const OPTIONS_BUTTON = '#options-button';
const OPTIONS_MODAL = '#options-modal';
const OPTIONS_SAVE_BUTTON = '#options-save';
const WALKA_TAB_BUTTON = 'button:has-text("Walka")';

/** Open the settings modal from the main menu. */
export async function openOptions(page: Page): Promise<Locator> {
    await page.click(MENU_BUTTON);
    await page.click(OPTIONS_BUTTON);
    const modal = page.locator(OPTIONS_MODAL);
    await expect(modal, 'should open options modal').toBeVisible();
    return modal;
}

/** Open the settings modal on the "Walka" tab, where the gag settings live. */
export async function openWalkaTab(page: Page): Promise<Locator> {
    const modal = await openOptions(page);
    await modal.locator(WALKA_TAB_BUTTON).click();
    await modal.locator('h5:has-text("Ustawienia walki")').waitFor({ state: 'visible' });
    return modal;
}

export function getLuaGagsSection(modal: Locator): Locator {
    return modal
        .locator('section')
        .filter({ has: modal.page().locator('h5:has-text("Ustawienia walki")') });
}

/** The delete-mode dropdown for one gag type (0 = keep, 1 = delete, 2 = prefix). */
export function getGagSelect(modal: Locator, gagType: string): Locator {
    return modal.locator(`select#luaGag-${gagType}`);
}

export function getGagColorInput(modal: Locator, gagType: string): Locator {
    return modal.locator(`input[type="color"]#luaGag-${gagType}`);
}

export function getGagResetButton(modal: Locator, gagType: string): Locator {
    return getLuaGagsSection(modal).locator(`select#luaGag-${gagType}`).locator('..').locator('button');
}

/** Save and close the settings modal. */
export async function saveOptions(page: Page): Promise<void> {
    await page.click(OPTIONS_SAVE_BUTTON);
    await expect(page.locator(OPTIONS_MODAL), 'should close options modal after saving')
        .not.toBeVisible();
}

/** Set one gag type's delete mode through the settings modal, then save. */
export async function setGagMode(page: Page, gagType: string, mode: '0' | '1' | '2'): Promise<void> {
    const modal = await openWalkaTab(page);
    await getGagSelect(modal, gagType).selectOption(mode);
    await saveOptions(page);
}

/** Read back what the UI persisted. Reading storage in an assertion is fine. */
export async function getStoredLuaGagsDeleteLines(page: Page) {
    return await page.evaluate(() => {
        const currentChar = localStorage.getItem('currentCharacter');
        const key = currentChar ? `${currentChar}:lua_gags_delete_lines` : 'lua_gags_delete_lines';
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    });
}
