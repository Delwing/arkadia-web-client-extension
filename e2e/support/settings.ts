import type {Locator, Page} from '@playwright/test';
import {expect} from './fixtures';

/**
 * Helpers for the unified settings dialog (#settings-modal): one Bootstrap
 * modal with a sidebar of pages (desktop) or a page <select> (narrow dialogs).
 */

export const SETTINGS_MODAL = '#settings-modal';
export const SETTINGS_SAVE = '#settings-save';

export type SettingsCategory =
    | 'character-general'
    | 'character-items'
    | 'character-combat'
    | 'character-guilds'
    | 'character-magics'
    | 'ui-appearance'
    | 'ui-windows'
    | 'ui-commands'
    | 'ui-buttons'
    | 'ui-mobile-buttons'
    | 'ui-radial'
    | 'ui-footer'
    | 'ui-map'
    | 'ui-sound'
    | 'ui-other';

/** Waits until a previous hide animation of the settings modal has finished. */
export async function waitForSettingsModalClosed(page: Page) {
    await page.waitForFunction(() => {
        const el = document.getElementById('settings-modal');
        return !el || window.getComputedStyle(el).display === 'none';
    });
}

/** Waits for the open animation, so a following hide() is not silently ignored. */
export async function waitForSettingsModalShown(page: Page) {
    await page.waitForSelector('#settings-modal.show', {timeout: 5000});
    // The dialog fades in; until that has settled the framework treats it as
    // still opening and drops a hide() on the floor.
    await page.waitForFunction(() => {
        const el = document.getElementById('settings-modal');
        return !!el && window.getComputedStyle(el).opacity === '1';
    });
}

/**
 * Opens the settings dialog from the menu. Character pages are reached through
 * "Ustawienia", UI pages through "Interfejs"; the dialog then navigates to
 * `category` when it is not that item's default page.
 */
export async function openSettings(page: Page, category: SettingsCategory = 'character-general'): Promise<Locator> {
    await waitForSettingsModalClosed(page);
    await page.click('#menu-button');
    await page.click(category.startsWith('ui-') ? '#ui-settings-button' : '#options-button');
    const modal = page.locator(SETTINGS_MODAL);
    await expect(modal, 'should open settings modal').toBeVisible();
    await waitForSettingsModalShown(page);
    await goToSettingsPage(page, category);
    return modal;
}

/**
 * Opens the settings dialog through the menu's "Przyciski" item, which lands on
 * one of the two buttons pages depending on the device, then shows `category`.
 */
export async function openButtonsSettings(page: Page, category: 'ui-buttons' | 'ui-mobile-buttons'): Promise<Locator> {
    await waitForSettingsModalClosed(page);
    await page.click('#menu-button');
    await page.click('#mobile-buttons-button');
    const modal = page.locator(SETTINGS_MODAL);
    await expect(modal, 'should open settings modal').toBeVisible();
    await waitForSettingsModalShown(page);
    await goToSettingsPage(page, category);
    return modal;
}

/** Shows a settings page through whichever navigation the dialog's width offers. */
export async function goToSettingsPage(page: Page, category: SettingsCategory) {
    const modal = page.locator(SETTINGS_MODAL);
    const select = modal.locator('#settings-category-select');
    if (await select.isVisible()) {
        await select.selectOption(category);
    } else {
        await modal.locator(`.settings-dialog__nav-item[data-settings-category="${category}"]`).click();
    }
    await expect(
        modal.locator(`.settings-page[data-settings-category="${category}"]`),
        `settings page ${category} should be shown`,
    ).toBeVisible();
}

/** Clicks the single Save button and waits for the dialog to close. */
export async function saveSettings(page: Page) {
    const modal = page.locator(SETTINGS_MODAL);
    await modal.locator(SETTINGS_SAVE).click();
    await expect(modal, 'settings modal should close after saving').not.toBeVisible();
}
