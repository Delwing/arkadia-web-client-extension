import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
import {dialogClose, dialogTitle} from './support/dialogs';
import {
    goToSettingsPage,
    openButtonsSettings,
    openSettings,
    saveSettings,
    SETTINGS_MODAL,
    waitForSettingsModalClosed,
    waitForSettingsModalShown,
} from './support/settings';

/**
 * The single settings dialog: character ("Ustawienia") and UI ("Interfejs")
 * settings share one Bootstrap modal with a page sidebar, a search box and one
 * Save button.
 */

const settingsPage = (page: Page, category: string) =>
    page.locator(`${SETTINGS_MODAL} .settings-page[data-settings-category="${category}"]`);

const navItem = (page: Page, category: string) =>
    page.locator(`${SETTINGS_MODAL} .settings-dialog__nav-item[data-settings-category="${category}"]`);

/** Every window the app has open - one element per window in index.html. */
const openWindows = (page: Page) => page.locator('[id$="-modal"]').filter({visible: true});

async function boot(page: Page) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
}

async function closeWithoutSaving(page: Page) {
    await dialogClose(page.locator(SETTINGS_MODAL)).click();
    await expect(page.locator(SETTINGS_MODAL), 'settings modal should close').not.toBeVisible();
    await waitForSettingsModalClosed(page);
}

test.describe('Settings dialog', () => {
    test('both menu items open the same dialog on their own page', async ({page}) => {
        await boot(page);
        const modal = page.locator(SETTINGS_MODAL);

        await page.click('#menu-button');
        await page.click('#options-button');
        await waitForSettingsModalShown(page);
        await expect(openWindows(page), 'only one settings modal is open').toHaveCount(1);
        await expect(dialogTitle(modal)).toHaveText('Ustawienia');
        await expect(settingsPage(page, 'character-general'), 'Ustawienia opens on Postac > Ogolne').toBeVisible();
        await expect(navItem(page, 'character-general')).toHaveClass(/settings-dialog__nav-item--active/);
        await expect(settingsPage(page, 'ui-appearance')).toBeHidden();
        await expect(modal.locator('#settings-category-select'), 'wide dialog has no page select').toBeHidden();
        await closeWithoutSaving(page);

        await page.click('#menu-button');
        await page.click('#ui-settings-button');
        await waitForSettingsModalShown(page);
        await expect(openWindows(page), 'only one settings modal is open').toHaveCount(1);
        await expect(dialogTitle(modal)).toHaveText('Ustawienia');
        await expect(settingsPage(page, 'ui-appearance'), 'Interfejs opens on Interfejs > Wyglad').toBeVisible();
        await expect(navItem(page, 'ui-appearance')).toHaveClass(/settings-dialog__nav-item--active/);
        await expect(settingsPage(page, 'character-general')).toBeHidden();

        // Both groups are reachable from the one sidebar.
        await goToSettingsPage(page, 'character-combat');
        await expect(settingsPage(page, 'ui-appearance')).toBeHidden();
    });

    test('search shows matching sections across pages and Escape clears it', async ({page}) => {
        await boot(page);
        const modal = await openSettings(page, 'ui-appearance');
        const search = modal.locator('#settings-search');

        await search.fill('kolor tla');

        await expect(settingsPage(page, 'ui-appearance'), 'Wyglad has a matching section').toBeVisible();
        await expect(settingsPage(page, 'ui-map'), 'Mapa has a matching section').toBeVisible();
        await expect(modal.locator('#ui-output-background')).toBeVisible();
        await expect(modal.locator('#ui-map-background-color')).toBeVisible();
        // Only the matching section of a page is shown, not the whole page.
        await expect(modal.locator('#ui-map-scale'), 'non-matching Mapa section is hidden').toBeHidden();
        // Pages without a match are hidden.
        await expect(settingsPage(page, 'ui-commands')).toBeHidden();
        await expect(settingsPage(page, 'ui-footer')).toBeHidden();
        await expect(settingsPage(page, 'character-combat')).toBeHidden();

        await search.press('Escape');
        await expect(search, 'Escape clears the query').toHaveValue('');
        await expect(modal, 'Escape in a non-empty search does not close the dialog').toBeVisible();
        await expect(settingsPage(page, 'ui-appearance'), 'back on the page that was open').toBeVisible();
        await expect(settingsPage(page, 'ui-map')).toBeHidden();
        await expect(modal.locator('#ui-map-scale')).toBeHidden();
    });

    test('marks a page with a list edit, and clears it when the list is back as it was', async ({page}) => {
        await boot(page);
        const modal = await openSettings(page, 'ui-windows');
        const dot = navItem(page, 'ui-windows').locator('.settings-dialog__dirty');
        const input = modal.locator('#ui-object-context-menu-input');

        await input.fill('obejrzyj');
        await expect(dot, 'typing into the add field is not a change yet').toHaveCount(0);
        await input.press('Enter');
        const badge = modal.locator('.context-menu-badge', {hasText: 'obejrzyj'});
        await expect(badge).toBeVisible();
        await expect(dot, 'adding a command is a change').toBeVisible();

        await badge.click();
        await expect(badge).toHaveCount(0);
        await expect(dot, 'removing it again leaves nothing unsaved').toHaveCount(0);
    });

    test('marks pages with unsaved changes until the dialog is reopened', async ({page}) => {
        await boot(page);
        let modal = await openSettings(page, 'ui-mobile-buttons');
        const checkbox = modal.locator('#ui-haptic-feedback');
        const initiallyChecked = await checkbox.isChecked();
        const dot = navItem(page, 'ui-mobile-buttons').locator('.settings-dialog__dirty');

        await expect(dot).toHaveCount(0);
        await checkbox.setChecked(!initiallyChecked);
        await expect(dot, 'toggling a checkbox marks the page as unsaved').toBeVisible();
        await expect(navItem(page, 'ui-appearance').locator('.settings-dialog__dirty')).toHaveCount(0);

        await checkbox.setChecked(initiallyChecked);
        await expect(dot, 'setting the value back clears the marker').toHaveCount(0);

        await checkbox.setChecked(!initiallyChecked);
        await expect(dot).toBeVisible();

        await closeWithoutSaving(page);

        modal = await openSettings(page, 'ui-mobile-buttons');
        await expect(dot, 'reopening drops the unsaved marker').toHaveCount(0);
        await expect(
            modal.locator('#ui-haptic-feedback'),
            'closing without saving discards the change',
        ).toBeChecked({checked: initiallyChecked});
    });

    test('a migrated page raises the unsaved dot and saves like any other', async ({page}) => {
        // Komendy is on the design system: its checkbox is a Radix
        // <button role="checkbox">, not an <input>. Nothing about that is
        // visible to a user, and nothing fails loudly if it regresses — the
        // page just quietly stops reporting itself as dirty, and a <label for>
        // stops toggling it. Both are what this test is here for.
        await boot(page);
        let modal = await openSettings(page, 'ui-commands');
        const dot = navItem(page, 'ui-commands').locator('.settings-dialog__dirty');
        const checkbox = modal.locator('#ui-command-echo');
        const initiallyChecked = await checkbox.isChecked();

        await expect(dot).toHaveCount(0);

        // Through the label, which cannot activate a <button> on its own.
        await modal.locator('label[for="ui-command-echo"]').click();
        await expect(checkbox, 'the label toggles the checkbox').toBeChecked({checked: !initiallyChecked});
        await expect(dot, 'toggling a migrated checkbox marks the page').toBeVisible();

        await modal.locator('label[for="ui-command-echo"]').click();
        await expect(dot, 'setting it back clears the marker').toHaveCount(0);

        await checkbox.setChecked(!initiallyChecked);
        await saveSettings(page);

        modal = await openSettings(page, 'ui-commands');
        await expect(
            modal.locator('#ui-command-echo'),
            'the change survived the save',
        ).toBeChecked({checked: !initiallyChecked});
        await expect(dot, 'reopening drops the marker').toHaveCount(0);
    });

    test('button editors are pages saved by the dialog', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 900});
        await boot(page);
        const liveButton = page.locator('.desktop-buttons-container .desktop-button', {hasText: 'Zapisany'});

        await page.click('#menu-button');
        await page.click('#mobile-buttons-button');
        await waitForSettingsModalShown(page);
        await expect(settingsPage(page, 'ui-buttons'), '"Przyciski" opens the buttons page on a desktop').toBeVisible();

        const desktopDot = navItem(page, 'ui-buttons').locator('.settings-dialog__dirty');
        await settingsPage(page, 'ui-buttons').getByRole('button', {name: '+ Dodaj przycisk'}).click();
        await settingsPage(page, 'ui-buttons').locator('input[type="text"]').first().fill('Zapisany');
        await expect(desktopDot, 'adding a button marks the page').toBeVisible();

        await goToSettingsPage(page, 'ui-mobile-buttons');
        const mobileDot = navItem(page, 'ui-mobile-buttons').locator('.settings-dialog__dirty');
        await settingsPage(page, 'ui-mobile-buttons').locator('#mobile-buttons-preview-solo [data-button-id="button-1"]').click();
        const config = page.locator('.mobile-button-config');
        await config.locator('input[type="color"]').first().fill('#ff0000');
        await dialogClose(config).click();
        await expect(config).toHaveCount(0);
        await expect(mobileDot, 'a change made in the closed config popup still counts').toBeVisible();

        await closeWithoutSaving(page);
        await expect(liveButton, 'closing without saving adds no button').toHaveCount(0);

        const modal = await openButtonsSettings(page, 'ui-buttons');
        await expect(desktopDot, 'reopening drops the unsaved marker').toHaveCount(0);
        await expect(modal.getByText('Brak przycisków.', {exact: false}), 'the unsaved button is gone').toBeVisible();

        await settingsPage(page, 'ui-buttons').getByRole('button', {name: '+ Dodaj przycisk'}).click();
        await settingsPage(page, 'ui-buttons').locator('input[type="text"]').first().fill('Zapisany');
        await saveSettings(page);
        await expect(liveButton, 'saving shows the new button').toBeVisible();
    });

    test('radial menu and mobile buttons, sharing one stored entry, both save', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 900});
        await boot(page);

        await page.click('#menu-button');
        await page.click('#mobile-radial-button');
        await waitForSettingsModalShown(page);
        const radialPage = settingsPage(page, 'ui-radial');
        await expect(radialPage, '"Menu kołowe" opens its page').toBeVisible();

        await radialPage.locator('#mobile-radial-add').click();
        await radialPage.locator('input[placeholder="Tekst komendy"]').last().fill('zerknij');
        await expect(navItem(page, 'ui-radial').locator('.settings-dialog__dirty')).toBeVisible();

        await goToSettingsPage(page, 'ui-mobile-buttons');
        await settingsPage(page, 'ui-mobile-buttons').locator('#mobile-buttons-preview-solo [data-button-id="button-1"]').click();
        const config = page.locator('.mobile-button-config');
        await config.locator('.mobile-button-label').fill('Wspolny');
        await dialogClose(config).click();

        await saveSettings(page);
        await expect(
            page.locator('#mobile-direction-buttons #button-1'),
            'the mobile button change is saved',
        ).toHaveText('Wspolny');

        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await openSettings(page, 'ui-radial');
        await expect(
            settingsPage(page, 'ui-radial').locator('input[placeholder="Tekst komendy"]').last(),
            'the radial command survived the mobile buttons save',
        ).toHaveValue('zerknij');
        await expect(page.locator('#mobile-direction-buttons #button-1')).toHaveText('Wspolny');
    });
});

test.describe('Settings dialog on a phone', () => {
    test.use({viewport: {width: 390, height: 844}});

    test('swaps the sidebar for a page select', async ({page}) => {
        await boot(page);
        await page.click('#menu-button');
        await page.click('#ui-settings-button');
        await waitForSettingsModalShown(page);
        const modal = page.locator(SETTINGS_MODAL);

        const select = modal.locator('#settings-category-select');
        await expect(select, 'narrow dialog shows the page select').toBeVisible();
        await expect(modal.locator('.settings-dialog__nav'), 'and hides the sidebar').toBeHidden();
        await expect(select).toHaveValue('ui-appearance');

        await select.selectOption('ui-map');
        await expect(settingsPage(page, 'ui-map')).toBeVisible();
        await expect(settingsPage(page, 'ui-appearance')).toBeHidden();
    });
});
