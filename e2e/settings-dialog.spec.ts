import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
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
 * settings share one window with a page sidebar, a search box and one
 * Save button.
 */

const settingsPage = (page: Page, category: string) =>
    page.locator(`${SETTINGS_MODAL} .settings-page[data-settings-category="${category}"]`);

const navItem = (page: Page, category: string) =>
    page.locator(`${SETTINGS_MODAL} .settings-dialog__nav-item[data-settings-category="${category}"]`);

async function boot(page: Page) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
}

async function closeWithoutSaving(page: Page) {
    await page.locator(`${SETTINGS_MODAL} .app-modal__close`).click();
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
        await expect(page.locator('.app-modal:not([hidden])'), 'only one settings modal is open').toHaveCount(1);
        await expect(modal.locator('.app-modal__title')).toHaveText('Ustawienia');
        await expect(settingsPage(page, 'character-general'), 'Ustawienia opens on Postac > Ogolne').toBeVisible();
        await expect(navItem(page, 'character-general')).toHaveClass(/settings-dialog__nav-item--active/);
        await expect(settingsPage(page, 'ui-appearance')).toBeHidden();
        await expect(modal.locator('.settings-dialog--phone'), 'wide dialog is not the phone one').toHaveCount(0);
        await closeWithoutSaving(page);

        await page.click('#menu-button');
        await page.click('#ui-settings-button');
        await waitForSettingsModalShown(page);
        await expect(page.locator('.app-modal:not([hidden])'), 'only one settings modal is open').toHaveCount(1);
        await expect(modal.locator('.app-modal__title')).toHaveText('Ustawienia');
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

    test('search marks the sidebar pages that have results and walks between them', async ({page}) => {
        await boot(page);
        const modal = await openSettings(page, 'ui-appearance');
        const search = modal.locator('#settings-search');
        const counter = modal.locator('#settings-search-count');
        const pages = modal.locator('.settings-dialog__pages');

        await search.fill('kolor tla');

        // The sidebar says which pages have results, and how many sections each.
        await expect(navItem(page, 'ui-appearance').locator('.settings-dialog__nav-count')).toBeVisible();
        await expect(navItem(page, 'ui-map').locator('.settings-dialog__nav-count')).toBeVisible();
        await expect(navItem(page, 'ui-commands').locator('.settings-dialog__nav-count'),
            'a page with no results gets no count').toHaveCount(0);
        await expect(navItem(page, 'ui-commands'), 'and is dimmed').toHaveClass(/settings-dialog__nav-item--empty/);

        // The counter starts on the first page with results, in sidebar order.
        await expect(counter).toHaveText(/^1 z [2-9]/);
        await expect(navItem(page, 'ui-appearance')).toHaveClass(/settings-dialog__nav-item--active/);

        // Next walks to the following page and scrolls its results into view.
        await modal.locator('#settings-search-next').click();
        await expect(counter).toHaveText(/^2 z /);
        await expect(navItem(page, 'ui-appearance')).not.toHaveClass(/settings-dialog__nav-item--active/);
        await expect.poll(() => pages.evaluate(el => el.scrollTop), {message: 'scrolled down to it'})
            .toBeGreaterThan(0);

        // Enter in the search field does the same, Shift+Enter goes back.
        await search.press('Enter');
        await expect(counter).toHaveText(/^3 z |^1 z /);
        await search.press('Shift+Enter');
        await expect(counter).toHaveText(/^2 z /);

        // Clicking a marked page jumps to it and keeps the query.
        await modal.locator('#settings-search-prev').click();
        await expect(counter).toHaveText(/^1 z /);
        await navItem(page, 'ui-map').click();
        await expect(search, 'the query stays put').toHaveValue('kolor tla');
        await expect(navItem(page, 'ui-map')).toHaveClass(/settings-dialog__nav-item--active/);

        // A page with no results is opened the usual way, which ends the search.
        await navItem(page, 'ui-commands').click();
        await expect(search).toHaveValue('');
        await expect(settingsPage(page, 'ui-commands')).toBeVisible();
    });

    test('search with no results says so and offers nothing to walk', async ({page}) => {
        await boot(page);
        const modal = await openSettings(page, 'ui-appearance');
        await modal.locator('#settings-search').fill('zzzznicniepasuje');

        await expect(modal.locator('#settings-search-count')).toHaveText('brak wyników');
        await expect(modal.locator('#settings-search-next')).toBeDisabled();
        await expect(modal.locator('#settings-search-prev')).toBeDisabled();
        await expect(modal.locator('.settings-dialog__nav-count')).toHaveCount(0);
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
        await config.locator('.mobile-button-config__close').click();
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
        await config.locator('.mobile-button-config__close').click();

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

    const phoneRow = (page: Page, category: string) =>
        page.locator(`${SETTINGS_MODAL} .settings-phone__row[data-settings-category="${category}"]`);

    async function openFromMenu(page: Page, item: string) {
        await page.click('#menu-button');
        await page.click(item);
        await waitForSettingsModalShown(page);
    }

    test('opens on a list of pages grouped by where they are saved, and drills in', async ({page}) => {
        await boot(page);
        await openFromMenu(page, '#ui-settings-button');
        const modal = page.locator(SETTINGS_MODAL);

        await expect(modal.locator('.settings-dialog__nav'), 'no sidebar on a phone').toHaveCount(0);
        await expect(modal.locator('.settings-phone__caption')).toHaveText(['Postać', 'Interfejs', 'Dane']);
        await expect(modal.locator('[data-settings-group="ui"] .settings-scope-chip')).toHaveText('wszystkie postacie');
        await expect(modal.locator('[data-settings-group="data"] .settings-scope-chip'), 'Dane carry no chip').toHaveCount(0);
        await expect(phoneRow(page, 'ui-commands').locator('.settings-phone__row-summary'), 'a summary of the page').toContainText('multibindy');
        await expect(modal.locator('.app-modal__footer'), 'no Save until something changes').toBeHidden();

        await phoneRow(page, 'ui-map').click();
        await expect(settingsPage(page, 'ui-map')).toBeVisible();
        await expect(modal.locator('.settings-phone__title')).toHaveText('Mapa');
        await expect(modal.locator('.app-modal__header'), 'the page brings its own header').toBeHidden();

        await modal.locator('#settings-phone-back').click();
        await expect(settingsPage(page, 'ui-map')).toBeHidden();
        await expect(phoneRow(page, 'ui-map')).toBeVisible();
    });

    test('a specific page opens straight on it', async ({page}) => {
        await boot(page);
        await openFromMenu(page, '#mobile-radial-button');
        await expect(settingsPage(page, 'ui-radial')).toBeVisible();
        await expect(page.locator(`${SETTINGS_MODAL} #settings-phone-back`)).toBeVisible();
    });

    test('section chips jump within the page', async ({page}) => {
        await boot(page);
        await openFromMenu(page, '#ui-settings-button');
        await phoneRow(page, 'ui-map').click();
        const chips = page.locator(`${SETTINGS_MODAL} .settings-phone__chip`);
        await expect(chips.first()).toHaveClass(/is-active/);
        const count = await chips.count();
        expect(count, 'Mapa has several cards').toBeGreaterThan(1);
        await chips.nth(count - 1).click();
        await expect(chips.nth(count - 1)).toHaveClass(/is-active/);
        const pane = page.locator(`${SETTINGS_MODAL} .settings-dialog__pages`);
        expect(await pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    });

    test('search lists individual settings; a switch flips in place and the save bar follows', async ({page}) => {
        await boot(page);
        await openFromMenu(page, '#ui-settings-button');
        const modal = page.locator(SETTINGS_MODAL);

        await modal.locator('#settings-search').fill('echo komend');
        const result = modal.locator('.settings-phone__result', {hasText: 'Echo komend'});
        await expect(result.locator('.settings-phone__trail')).toHaveText('Interfejs › Komendy');
        await expect(result.locator('.settings-phone__mark').first()).toHaveText('Echo');
        const toggle = result.locator('.settings-phone__switch');
        const before = await toggle.getAttribute('data-checked');

        await toggle.click();
        await expect(toggle).not.toHaveAttribute('data-checked', before!);
        await expect(modal.locator('#settings-phone-unsaved')).toHaveText('1 niezapisana zmiana');

        await modal.locator('#settings-phone-revert').click();
        await expect(modal.locator('#settings-phone-unsaved')).toHaveCount(0);
        await expect(toggle).toHaveAttribute('data-checked', before!);
    });

    test('a value setting opens its page at that setting; Back returns to the results', async ({page}) => {
        await boot(page);
        await openFromMenu(page, '#ui-settings-button');
        const modal = page.locator(SETTINGS_MODAL);

        await modal.locator('#settings-search').fill('skroty klawiszowe');
        const result = modal.locator('.settings-phone__result--open', {hasText: 'Skroty klawiszowe na pasku bindow'});
        await expect(result.locator('.settings-phone__preview')).toHaveText('Automatycznie (na telefonie po Alt, Ctrl lub Tab)');
        await expect(modal.locator('.settings-phone__caption--pages'), 'a setting is not a page').toHaveCount(0);

        await result.click();
        await expect(settingsPage(page, 'ui-commands')).toBeVisible();
        await expect(modal.locator('#ui-multibind-key-hints')).toBeInViewport();

        await modal.locator('#settings-phone-back').click();
        await expect(modal.locator('#settings-search')).toHaveValue('skroty klawiszowe');
    });

    test('pages that match are listed under Strony; a change is saved from the bar', async ({page}) => {
        await boot(page);
        await openFromMenu(page, '#ui-settings-button');
        const modal = page.locator(SETTINGS_MODAL);

        await modal.locator('#settings-search').fill('mapa');
        await expect(modal.locator('.settings-phone__caption--pages')).toBeVisible();
        await modal.locator('.settings-phone__card .settings-phone__row[data-settings-category="ui-map"]').click();
        await expect(settingsPage(page, 'ui-map')).toBeVisible();

        await goToSettingsPage(page, 'ui-commands');
        await modal.locator('#ui-command-echo').click();
        await expect(modal.locator('#settings-phone-unsaved')).toHaveText('1 niezapisana zmiana');
        await saveSettings(page);
    });
});
