import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    waitForCharacter,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

async function prepareClient(page: Page, charName = 'Tester'): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page, {name: charName});
    await waitForMapReady(page);
}

async function openPeopleBrowser(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#people-browser-button');
}

function peopleBrowserPopup(page: Page) {
    return page.locator('.people-browser');
}

async function waitForPeopleLoaded(page: Page): Promise<void> {
    const popup = peopleBrowserPopup(page);
    await expect(popup).toBeVisible();
    // Wait for loading to finish - either items appear or "Brak danych" shows
    await expect(popup.locator('.people-browser__loading')).not.toBeVisible({timeout: 5000});
}

async function addLocalPerson(
    page: Page,
    {name, description, guild}: {name: string; description: string; guild?: string},
): Promise<void> {
    const popup = peopleBrowserPopup(page);
    await popup.locator('button', {hasText: '+ Dodaj'}).click();

    const modal = page.locator('.modal.show');
    await expect(modal).toBeVisible();

    await modal.locator('input.form-control').nth(0).fill(name);
    await modal.locator('input.form-control').nth(1).fill(description);
    if (guild) {
        await modal.locator('select.form-select').selectOption(guild);
    }

    await modal.locator('button', {hasText: 'Zapisz'}).click();
    await expect(modal).not.toBeVisible();
}

test.describe('People browser popup', () => {
    test('opens and displays people from database', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);

        // Mock DB has 5 people: Aldous, Berenika, Cedric, Dagna, Eryk
        await expect(popup, 'should show people count in title').toContainText('Baza postaci (5)');

        const list = popup.locator('.people-browser__list');
        await expect(list.locator('.people-browser__item'), 'should display all 5 people').toHaveCount(5);

        // Verify known entries
        await expect(list, 'should contain Aldous from mock DB').toContainText('Aldous');
        await expect(list, 'should contain Berenika from mock DB').toContainText('Berenika');
    });

    test('adds a local person and shows it with local badge', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        await addLocalPerson(page, {
            name: 'Testowy',
            description: 'lokalny wojownik',
            guild: 'NPC',
        });

        const popup = peopleBrowserPopup(page);

        // Should now show 6 people (5 from DB + 1 local)
        await expect(popup, 'should increment count after adding local person').toContainText('Baza postaci (6)');

        const localPerson = popup.locator('.people-browser__item').filter({hasText: 'Testowy'});
        await expect(localPerson, 'should display newly added local person').toBeVisible();
        await expect(
            localPerson.locator('.people-browser__badge--local'),
            'should show local badge (+) on added person',
        ).toBeVisible();

        // "Tylko lokalne" filter should show only the local person
        await popup.locator('label', {hasText: 'Tylko lokalne'}).locator('input').check();
        await expect(
            popup.locator('.people-browser__item'),
            'should show only local person when local-only filter is active',
        ).toHaveCount(1);
        await expect(
            popup.locator('.people-browser__item').first(),
            'should display the local person in filtered view',
        ).toContainText('Testowy');
    });

    test('search filters people by name or description', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const searchInput = popup.locator('input[placeholder*="Szukaj"]');

        await searchInput.fill('Aldous');
        await expect(
            popup.locator('.people-browser__item'),
            'should filter to single result when searching by exact name',
        ).toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first(), 'should show Aldous in search results').toContainText('Aldous');

        // Clear and search by description
        await searchInput.fill('');
        await expect(popup.locator('.people-browser__item'), 'should show all people after clearing search').toHaveCount(5);

        await searchInput.fill('wojownik');
        await expect(
            popup.locator('.people-browser__item'),
            'should find people matching description search',
        ).toHaveCount(1);
    });

    test('guild filter narrows results to selected guild', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const guildSelect = popup.locator('.people-browser__guild-filter select');

        await guildSelect.selectOption('CKN');
        await expect(
            popup.locator('.people-browser__item'),
            'should show only CKN guild members',
        ).toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first(), 'should display Aldous for CKN guild').toContainText('Aldous');

        await guildSelect.selectOption('');
        await expect(popup.locator('.people-browser__item'), 'should show all people after clearing guild filter').toHaveCount(5);
    });

    test('marks person as enemy and shows enemy badge', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);

        // Click edit button on first person
        const firstPerson = popup.locator('.people-browser__item').first();
        await firstPerson.locator('button').click();

        const modal = page.locator('.modal.show');
        await expect(modal, 'should open edit modal').toBeVisible();

        // Click "Wrog" (enemy) button
        await modal.locator('button', {hasText: 'Wrog'}).click();

        // Close modal
        await modal.locator('button', {hasText: 'Anuluj'}).click();
        await expect(modal, 'should close edit modal').not.toBeVisible();

        // Verify enemy badge
        const enemyBadge = firstPerson.locator('.people-browser__badge--enemy');
        await expect(enemyBadge, 'should display enemy badge after marking as enemy').toBeVisible();
    });

    test('deletes a locally added person', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        await addLocalPerson(page, {
            name: 'DoUsuniecia',
            description: 'tymczasowa postac',
        });

        const popup = peopleBrowserPopup(page);
        await expect(popup, 'should show 6 people after adding').toContainText('Baza postaci (6)');

        // Click edit on the local person
        const localPerson = popup.locator('.people-browser__item').filter({hasText: 'DoUsuniecia'});
        await localPerson.locator('button').click();

        const modal = page.locator('.modal.show');
        await expect(modal, 'should open edit modal for local person').toBeVisible();

        // Click "Usun" (delete) button
        await modal.locator('button', {hasText: 'Usun'}).click();
        await expect(modal, 'should close modal after deletion').not.toBeVisible();

        // Person should be removed
        await expect(popup, 'should show 5 people after deleting local person').toContainText('Baza postaci (5)');
        await expect(
            popup.locator('.people-browser__item').filter({hasText: 'DoUsuniecia'}),
            'should no longer display deleted person',
        ).toHaveCount(0);
    });
});

test.describe('People browser popup – extended', () => {
    test('marks person as ally and shows ally badge', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const firstPerson = popup.locator('.people-browser__item').first();
        await firstPerson.locator('button').click();

        const modal = page.locator('.modal.show');
        await expect(modal, 'should open edit modal').toBeVisible();

        // Click "Sojusznik" (ally) button
        await modal.locator('button', {hasText: 'Sojusznik'}).click();

        // Close modal
        await modal.locator('button', {hasText: 'Anuluj'}).click();
        await expect(modal, 'should close edit modal').not.toBeVisible();

        // Verify ally badge
        const allyBadge = firstPerson.locator('.people-browser__badge--ally');
        await expect(allyBadge, 'should display ally badge after marking as ally').toBeVisible();

        // Verify ally CSS class on the item row
        await expect(firstPerson, 'should have ally class on item').toHaveClass(/people-browser__item--ally/);
    });

    test('ignores a remote person and restores them', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const aldousItem = popup.locator('.people-browser__item').filter({hasText: 'Aldous'});

        // Open edit modal for Aldous
        await aldousItem.locator('button').click();

        const modal = page.locator('.modal.show');
        await expect(modal, 'should open edit modal for Aldous').toBeVisible();

        // Click "Ignoruj" (ignore) button
        await modal.locator('button', {hasText: 'Ignoruj'}).click();
        await expect(modal, 'should close modal after ignoring').not.toBeVisible();

        // Aldous should now have ignored styling
        await expect(aldousItem, 'should have ignored class').toHaveClass(/people-browser__item--ignored/);

        // Count stays the same (ignored people still show)
        await expect(popup, 'should still show 5 people with ignored person visible').toContainText('Baza postaci (5)');

        // Now restore: click the edit button on ignored Aldous (shows ↩ icon)
        await aldousItem.locator('button').click();
        await expect(modal, 'should open edit modal for ignored Aldous').toBeVisible();

        // Click "Przywroc" (restore) button
        await modal.locator('button', {hasText: 'Przywroc'}).click();
        await expect(modal, 'should close modal after restoring').not.toBeVisible();

        // Aldous should no longer be ignored
        await expect(aldousItem, 'should not have ignored class after restore').not.toHaveClass(/people-browser__item--ignored/);
    });

    test('edits a remote person and shows edited badge', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);

        // Open edit modal for Aldous
        const aldousItem = popup.locator('.people-browser__item').filter({hasText: 'Aldous'});
        await aldousItem.locator('button').click();

        const modal = page.locator('.modal.show');
        await expect(modal, 'should open edit modal').toBeVisible();

        // Change description
        const descInput = modal.locator('input.form-control').nth(1);
        await descInput.fill('Zmodyfikowany opis');

        await modal.locator('button', {hasText: 'Zapisz'}).click();
        await expect(modal, 'should close modal after saving edit').not.toBeVisible();

        // Aldous should now show edited badge (*)
        const editedItem = popup.locator('.people-browser__item').filter({hasText: 'Aldous'});
        const editedBadge = editedItem.locator('.people-browser__badge--edited');
        await expect(editedBadge, 'should display edited badge after modifying person').toBeVisible();

        // Verify the description was changed in the list
        await expect(editedItem, 'should show updated description').toContainText('Zmodyfikowany opis');

        // Count should remain the same (edit, not add)
        await expect(popup, 'should still show 5 people after edit').toContainText('Baza postaci (5)');
    });

    test('status filter shows only enemies or allies', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const statusSelect = popup.locator('.people-browser__status-filter select');

        // Mark first person (Aldous) as enemy
        const aldousItem = popup.locator('.people-browser__item').filter({hasText: 'Aldous'});
        await aldousItem.locator('button').click();
        let modal = page.locator('.modal.show');
        await modal.locator('button', {hasText: 'Wrog'}).click();
        await modal.locator('button', {hasText: 'Anuluj'}).click();
        await expect(modal, 'should close modal after marking enemy').not.toBeVisible();

        // Mark second person (Berenika) as ally
        const berenikaItem = popup.locator('.people-browser__item').filter({hasText: 'Berenika'});
        await berenikaItem.locator('button').click();
        modal = page.locator('.modal.show');
        await modal.locator('button', {hasText: 'Sojusznik'}).click();
        await modal.locator('button', {hasText: 'Anuluj'}).click();
        await expect(modal, 'should close modal after marking ally').not.toBeVisible();

        // Filter by enemies
        await statusSelect.selectOption('enemy');
        await expect(
            popup.locator('.people-browser__item'),
            'should show only 1 enemy',
        ).toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first(), 'should show Aldous as enemy').toContainText('Aldous');

        // Filter by allies
        await statusSelect.selectOption('ally');
        await expect(
            popup.locator('.people-browser__item'),
            'should show only 1 ally',
        ).toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first(), 'should show Berenika as ally').toContainText('Berenika');

        // Clear filter
        await statusSelect.selectOption('');
        await expect(popup.locator('.people-browser__item'), 'should show all 5 people after clearing status filter').toHaveCount(5);
    });

    test('search clear button resets results', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const searchInput = popup.locator('input[placeholder*="Szukaj"]');

        // Type a search term
        await searchInput.fill('Aldous');
        await expect(
            popup.locator('.people-browser__item'),
            'should filter to single result',
        ).toHaveCount(1);

        // Click the clear button (X)
        await popup.locator('.people-browser__search-clear').click();

        // All results should be back
        await expect(searchInput, 'should clear the search input').toHaveValue('');
        await expect(popup.locator('.people-browser__item'), 'should show all 5 people after clearing search').toHaveCount(5);
    });

    test('pagination controls navigate between pages', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);

        // Add enough local people to exceed a small page size
        for (const suffix of ['Pag1', 'Pag2', 'Pag3', 'Pag4', 'Pag5', 'Pag6', 'Pag7', 'Pag8', 'Pag9', 'Pag10', 'Pag11']) {
            await addLocalPerson(page, {
                name: `Osoba${suffix}`,
                description: `opis ${suffix}`,
            });
        }

        // Now we have 16 people (5 remote + 11 local)
        await expect(popup, 'should show 16 people total').toContainText('Baza postaci (16)');

        // Change page size to 10
        const pageSizeSelect = popup.locator('.people-browser__page-size select');
        await pageSizeSelect.selectOption('10');

        // Pagination should appear
        const pagination = popup.locator('.people-browser__pagination');
        await expect(pagination, 'should show pagination controls').toBeVisible();

        // Should show "Strona 1 z 2"
        await expect(
            popup.locator('.people-browser__pagination-info'),
            'should show page 1 of 2',
        ).toContainText('Strona 1 z 2');

        // First page should have 10 items
        await expect(popup.locator('.people-browser__item'), 'should show 10 items on first page').toHaveCount(10);

        // Navigate to next page
        await pagination.locator('button[title="Nastepna strona"]').click();
        await expect(
            popup.locator('.people-browser__pagination-info'),
            'should show page 2 of 2',
        ).toContainText('Strona 2 z 2');
        await expect(popup.locator('.people-browser__item'), 'should show remaining items on second page').toHaveCount(6);

        // Navigate back to first page
        await pagination.locator('button[title="Poprzednia strona"]').click();
        await expect(
            popup.locator('.people-browser__pagination-info'),
            'should show page 1 again',
        ).toContainText('Strona 1 z 2');
    });
});

test.describe('PeopleLocalEvents character switch', () => {
    test('locally added people are isolated between characters', async ({page}) => {
        await prepareClient(page, 'PeopleCharA');

        // Open popup and add a local person for PeopleCharA
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        await addLocalPerson(page, {
            name: 'SojusznikA',
            description: 'przyjaciel postaci A',
        });

        const popup = peopleBrowserPopup(page);
        await expect(popup, 'should show 6 people for CharA (5 remote + 1 local)').toContainText('Baza postaci (6)');

        // Verify "Tylko lokalne" shows the person
        await popup.locator('label', {hasText: 'Tylko lokalne'}).locator('input').check();
        await expect(
            popup.locator('.people-browser__item'),
            'should show 1 local person for CharA',
        ).toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first(), 'should display SojusznikA').toContainText('SojusznikA');

        // Uncheck local-only filter
        await popup.locator('label', {hasText: 'Tylko lokalne'}).locator('input').uncheck();

        // Verify storage
        const charAData = await page.evaluate(() => {
            return localStorage.getItem('PeopleCharA:peopleLocalEvents');
        });
        expect(charAData, 'should have persisted local events for CharA').toBeTruthy();
        expect(charAData, 'should contain SojusznikA in CharA storage').toContain('SojusznikA');

        // Switch to PeopleCharB
        await primeCharInfo(page, {name: 'PeopleCharB'});
        await waitForCharacter(page, 'PeopleCharB');

        // Check "Tylko lokalne" - should be empty for CharB
        await popup.locator('label', {hasText: 'Tylko lokalne'}).locator('input').check();

        await expect.poll(async () => {
            const items = await popup.locator('.people-browser__item').count();
            const empty = await popup.locator('.people-browser__empty').count();
            return items === 0 || empty > 0;
        }, {message: 'should show no local people for CharB'}).toBe(true);

        // Uncheck filter and verify CharB has no local additions (still shows remote DB people)
        await popup.locator('label', {hasText: 'Tylko lokalne'}).locator('input').uncheck();
        await expect(popup, 'should show only remote people for CharB').toContainText('Baza postaci (5)');

        // Verify CharB has no local events in storage
        const charBData = await page.evaluate(() => {
            return localStorage.getItem('PeopleCharB:peopleLocalEvents');
        });
        expect(charBData, 'should have no local events stored for CharB').toBeNull();

        // Switch back to PeopleCharA
        await primeCharInfo(page, {name: 'PeopleCharA'});
        await waitForCharacter(page, 'PeopleCharA');

        // Verify CharA's local person is restored
        await expect(popup, 'should restore 6 people when switching back to CharA').toContainText('Baza postaci (6)');
        await popup.locator('label', {hasText: 'Tylko lokalne'}).locator('input').check();
        await expect(
            popup.locator('.people-browser__item'),
            'should restore CharA local person after switch back',
        ).toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first(), 'should still display SojusznikA after switch').toContainText('SojusznikA');
    });
});
