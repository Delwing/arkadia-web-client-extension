import type {Locator, Page} from '@playwright/test';
import {expect} from './fixtures';

/**
 * Helpers for the unified settings dialog (#settings-modal): one window
 * with a sidebar of pages (desktop) or a page <select> (narrow dialogs).
 */

export const SETTINGS_MODAL = '#settings-modal';
export const SETTINGS_SAVE = '#settings-save';
export const SETTINGS_DISCARD = '#settings-discard';
/** The menu's one "Ustawienia" entry; the dialog reopens where it was left. */
export const SETTINGS_BUTTON = '#settings-button';

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
    | 'ui-other'
    | 'data-sync'
    | 'data-backup'
    | 'data-devices';

/** Waits until a previous hide animation of the settings modal has finished. */
export async function waitForSettingsModalClosed(page: Page) {
    await page.waitForFunction(() => {
        const el = document.getElementById('settings-modal');
        return !el || window.getComputedStyle(el).display === 'none';
    });
}

/** Waits for the settings window to be open. */
export async function waitForSettingsModalShown(page: Page) {
    await page.waitForSelector('#settings-modal:not([hidden])', {timeout: 5000});
}

/** Opens the settings dialog from the menu's "Ustawienia", as it was left. */
export async function openSettingsDialog(page: Page): Promise<Locator> {
    await waitForSettingsModalClosed(page);
    await page.click('#menu-button');
    await page.click(SETTINGS_BUTTON);
    const modal = page.locator(SETTINGS_MODAL);
    await expect(modal, 'should open settings modal').toBeVisible();
    await waitForSettingsModalShown(page);
    return modal;
}

/** Opens the settings dialog from the menu and shows `category`. */
export async function openSettings(page: Page, category: SettingsCategory = 'character-general'): Promise<Locator> {
    const modal = await openSettingsDialog(page);
    await goToSettingsPage(page, category);
    return modal;
}

/** Drops every unsaved edit with "Odrzuć zmiany" (the wide layout) or the phone's Cofnij. */
export async function discardSettings(page: Page) {
    const modal = page.locator(SETTINGS_MODAL);
    await modal.locator(`#settings-phone-revert, ${SETTINGS_DISCARD}:visible`).first().click();
    await expect(modal.locator(`#settings-phone-revert, ${SETTINGS_DISCARD}:visible`)).toHaveCount(0);
}

/**
 * Shows a settings page through whichever navigation the dialog's width
 * offers: the sidebar, or on a phone the list of pages (back to it first when
 * another page is open).
 */
export async function goToSettingsPage(page: Page, category: SettingsCategory) {
    const modal = page.locator(SETTINGS_MODAL);
    const target = modal.locator(`.settings-page[data-settings-category="${category}"]`);
    const sidebar = modal.locator(`.settings-dialog__nav-item[data-settings-category="${category}"]`);
    const phone = modal.locator('.settings-dialog--phone');
    await expect(sidebar.or(phone)).toBeVisible();
    if (await sidebar.isVisible()) {
        await sidebar.click();
    } else if (!(await target.isVisible())) {
        const back = modal.locator('#settings-phone-back');
        if (await back.isVisible()) await back.click();
        // Back returns to search results when the page was opened from them.
        const search = modal.locator('#settings-search');
        if (await search.inputValue()) await search.fill('');
        await modal.locator(`.settings-phone__row[data-settings-category="${category}"]`).click();
    }
    await expect(target, `settings page ${category} should be shown`).toBeVisible();
}

/** Clicks the single Save button and waits for the dialog to close. */
export async function saveSettings(page: Page) {
    const modal = page.locator(SETTINGS_MODAL);
    // On a phone Save is the bar that appears once something changed.
    await modal.locator(`#settings-phone-save, ${SETTINGS_SAVE}:visible`).first().click();
    await expect(modal, 'settings modal should close after saving').not.toBeVisible();
}
