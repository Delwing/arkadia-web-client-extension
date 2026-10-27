import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    GMCP_PATHS,
    pushGmcp,
    primeCharInfo,
    pushText,
    waitForCharacter,
    waitForCommandInput,
    waitForMapReady,
    waitForOutputContaining,
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

function personPanel(page: Page) {
    return peopleBrowserPopup(page).locator('.people-panel');
}

async function openPerson(page: Page, name: string): Promise<void> {
    await peopleBrowserPopup(page).locator('.people-browser__item').filter({hasText: name}).click();
    await expect(personPanel(page).locator('.people-panel__name')).toContainText(name);
}

async function addLocalPerson(
    page: Page,
    {name, description, guild}: {name: string; description: string; guild?: string},
): Promise<void> {
    const popup = peopleBrowserPopup(page);
    await popup.locator('.people-browser__add').click();

    const panel = personPanel(page);
    await expect(panel).toContainText('Nowa postać');

    await panel.locator('.people-panel__field-name input').fill(name);
    await panel.locator('.people-panel__field-desc input').fill(description);
    if (guild) {
        await panel.locator('.people-panel__field-guild select').selectOption(guild);
    }

    await panel.locator('button', {hasText: 'Dodaj'}).click();
    // Saving opens the new entry in the panel.
    await expect(panel.locator('.people-panel__name')).toContainText(name);
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
        const firstPerson = popup.locator('.people-browser__item').first();
        await firstPerson.click();

        const panel = personPanel(page);
        await expect(panel, 'should open the person panel').toBeVisible();

        // Marks save immediately, no Zapisz needed
        await panel.locator('button', {hasText: 'Wróg'}).click();

        const enemyBadge = firstPerson.locator('.people-browser__badge--enemy');
        await expect(enemyBadge, 'should display enemy badge after marking as enemy').toBeVisible();
        await expect(panel.locator('.people-browser__badge--enemy'), 'should show the mark in the panel too').toBeVisible();
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

        const panel = personPanel(page);
        await panel.locator('button', {hasText: 'Usuń'}).click();
        await expect(panel, 'should close the panel after deletion').not.toBeVisible();

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
        await firstPerson.click();

        await personPanel(page).locator('button', {hasText: 'Sojusznik'}).click();

        const allyBadge = firstPerson.locator('.people-browser__badge--ally');
        await expect(allyBadge, 'should display ally badge after marking as ally').toBeVisible();
        await expect(firstPerson, 'should have ally class on item').toHaveClass(/people-browser__item--ally/);

        // Toggling again removes the mark
        await personPanel(page).locator('button', {hasText: 'Sojusznik'}).click();
        await expect(allyBadge, 'should remove the ally badge when toggled off').toHaveCount(0);
    });

    test('ignores a remote person and restores them', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const aldousItem = popup.locator('.people-browser__item').filter({hasText: 'Aldous'});
        await openPerson(page, 'Aldous');

        const panel = personPanel(page);
        await panel.locator('button', {hasText: 'Ignoruj'}).click();

        await expect(aldousItem, 'should have ignored class').toHaveClass(/people-browser__item--ignored/);
        await expect(panel, 'should explain the entry is ignored').toContainText('Ta postać jest ignorowana');

        // Count stays the same (ignored people still show)
        await expect(popup, 'should still show 5 people with ignored person visible').toContainText('Baza postaci (5)');

        await panel.locator('button', {hasText: 'Przywróć'}).click();
        await expect(aldousItem, 'should not have ignored class after restore').not.toHaveClass(/people-browser__item--ignored/);
        await expect(panel.locator('button', {hasText: 'Ignoruj'}), 'should offer editing again').toBeVisible();
    });

    test('edits a remote person and shows edited badge', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        await openPerson(page, 'Aldous');

        const panel = personPanel(page);
        const save = panel.locator('button', {hasText: 'Zapisz'});
        await expect(save, 'should not save an unchanged entry').toBeDisabled();

        await panel.locator('.people-panel__field-desc input').fill('Zmodyfikowany opis');
        await save.click();

        const editedItem = popup.locator('.people-browser__item').filter({hasText: 'Aldous'});
        await expect(editedItem.locator('.people-browser__badge--edited'), 'should display edited badge after modifying person').toBeVisible();
        await expect(editedItem, 'should show updated description').toContainText('Zmodyfikowany opis');
        await expect(editedItem, 'should keep the edited entry selected').toHaveClass(/people-browser__item--selected/);
        await expect(panel, 'should show the original values').toContainText('Oryginał');

        await expect(popup, 'should still show 5 people after edit').toContainText('Baza postaci (5)');

        // Przywróć brings the original back
        await panel.locator('.people-panel__original button', {hasText: 'Przywróć'}).click();
        await expect(editedItem.locator('.people-browser__badge--edited'), 'should drop the edited badge').toHaveCount(0);
        await expect(editedItem, 'should show the original description').not.toContainText('Zmodyfikowany opis');
    });

    test('Anuluj discards unsaved changes', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        await openPerson(page, 'Aldous');
        const panel = personPanel(page);
        const descInput = panel.locator('.people-panel__field-desc input');
        const original = await descInput.inputValue();

        await descInput.fill('chwilowy opis');
        await panel.locator('button', {hasText: 'Anuluj'}).click();

        await expect(descInput, 'should restore the saved description').toHaveValue(original);
        await expect(panel.locator('button', {hasText: 'Zapisz'})).toBeDisabled();
    });

    test('status filter shows only enemies or allies', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const statusFilter = popup.locator('.people-browser__status-filter');
        const panel = personPanel(page);

        await openPerson(page, 'Aldous');
        await panel.locator('button', {hasText: 'Wróg'}).click();
        await openPerson(page, 'Berenika');
        await panel.locator('button', {hasText: 'Sojusznik'}).click();

        // Each option shows how many entries it holds
        await expect(statusFilter, 'should count enemies').toContainText('Wrogowie 1');
        await expect(statusFilter, 'should count allies').toContainText('Sojusznicy 1');

        await statusFilter.getByText('Wrogowie').click();
        await expect(popup.locator('.people-browser__item'), 'should show only 1 enemy').toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first(), 'should show Aldous as enemy').toContainText('Aldous');

        await statusFilter.getByText('Sojusznicy').click();
        await expect(popup.locator('.people-browser__item'), 'should show only 1 ally').toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first(), 'should show Berenika as ally').toContainText('Berenika');

        await statusFilter.getByText('Wszyscy').click();
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
        await pagination.locator('button[title="Następna strona"]').click();
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

test.describe('People notes', () => {
    test('shows a ticked note under the room living line', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        await openPerson(page, 'Aldous');
        const panel = personPanel(page);
        await panel.locator('textarea').fill('pozycza i nie oddaje');
        await panel.locator('label', {hasText: 'Pokaż notatkę przy spotkaniu'}).locator('input').check();
        await panel.locator('button', {hasText: 'Zapisz'}).click();
        await expect(panel.locator('button', {hasText: 'Zapisz'}), 'should be saved').toBeDisabled();

        await pushText(page, 'Wysoki wojownik stoi tutaj.', {type: 'room.contents.living'});
        await waitForOutputContaining(page, 'Notatka (Aldous): pozycza i nie oddaje');

        // Opening another entry and coming back shows the saved note and tick
        await openPerson(page, 'Berenika');
        await expect(panel.locator('textarea')).toHaveValue('');
        await openPerson(page, 'Aldous');
        await expect(panel.locator('textarea')).toHaveValue('pozycza i nie oddaje');
        await expect(panel.locator('label', {hasText: 'Pokaż notatkę przy spotkaniu'}).locator('input')).toBeChecked();
        await expect(
            peopleBrowserPopup(page).locator('.people-browser__item').filter({hasText: 'Aldous'}).locator('.people-browser__note'),
            'should mark the row as having a note',
        ).toBeVisible();
    });
});

async function setCurrentRoom(page: Page, roomId: number, name: string, x: number, y = 0): Promise<void> {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        num: roomId,
        id: roomId,
        name,
        zone: 'Miasteczko Poslan',
        exits: {},
        map: {x, y, name: 'Miasteczko Poslan'},
    });
    await expect(page.locator('#location-text')).toContainText(`#${roomId}`, {timeout: 5000});
}

/** Drags the popup's right edge so its body reaches the given width. */
async function widenPopup(page: Page, width: number): Promise<void> {
    const popup = peopleBrowserPopup(page);
    const edge = popup.locator('.floating-panel__edge--e');
    const box = await edge.boundingBox();
    const bodyBox = await popup.locator('.people-browser-body').boundingBox();
    if (!box || !bodyBox) throw new Error('popup is not on screen');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + (width - bodyBox.width), startY, {steps: 5});
    await page.mouse.up();
}

test.describe('People browser – NPC location', () => {
    test('an NPC gets a location from the NPC database and can be led to', async ({page}) => {
        await prepareClient(page);
        await setCurrentRoom(page, 1, 'Poczta', 0);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        // The mock NPC database places Borgaf Kriegmann in room 4.
        await addLocalPerson(page, {name: 'Borgaf Kriegmann', description: 'krzepki krasnolud', guild: 'NPC'});

        const panel = personPanel(page);
        const suggestion = panel.locator('.people-panel__suggestion');
        await expect(suggestion, 'should offer the room from the NPC database').toContainText('#4');
        await expect(suggestion).toContainText('Rezydencja Borgafa');
        await suggestion.locator('button', {hasText: 'Użyj'}).click();

        await expect(panel.locator('.people-panel__location-input')).toHaveValue('4');
        await expect(panel.locator('.people-panel__room'), 'should name the room').toContainText('Rezydencja Borgafa');
        await panel.locator('button', {hasText: 'Zapisz'}).click();
        await expect(suggestion, 'should stop suggesting once used').toHaveCount(0);

        const row = peopleBrowserPopup(page).locator('.people-browser__item').filter({hasText: 'Borgaf Kriegmann'});
        await expect(row, 'should show the room in the list').toContainText('Rezydencja Borgafa');

        await panel.locator('button', {hasText: 'Prowadź'}).click();
        await expect(page.locator('#location-text'), 'should lead to the NPC').toContainText('→ #4');
    });

    test('Tutaj fills in the current room, and search finds people by room', async ({page}) => {
        await prepareClient(page);
        await setCurrentRoom(page, 2, 'Rynek', 1);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        await addLocalPerson(page, {name: 'Straganiarz', description: 'gruby kupiec', guild: 'NPC'});
        const panel = personPanel(page);
        await panel.locator('button', {hasText: 'Tutaj'}).click();
        await expect(panel.locator('.people-panel__location-input')).toHaveValue('2');
        await panel.locator('button', {hasText: 'Zapisz'}).click();
        await expect(panel.locator('button', {hasText: 'Zapisz'})).toBeDisabled();

        const popup = peopleBrowserPopup(page);
        await popup.locator('input[placeholder*="Szukaj"]').fill('rynek');
        await expect(popup.locator('.people-browser__item'), 'should find the NPC by its room name').toHaveCount(1);
        await expect(popup.locator('.people-browser__item').first()).toContainText('Straganiarz');

        // Located entries count as local changes
        await popup.locator('input[placeholder*="Szukaj"]').fill('');
        await popup.locator('label', {hasText: 'Tylko lokalne'}).locator('input').check();
        await expect(popup.locator('.people-browser__item')).toHaveCount(1);
    });

    test('only NPCs have a location, and a bad room number cannot be saved', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        await openPerson(page, 'Aldous');
        const panel = personPanel(page);
        await expect(panel.locator('.people-panel__location'), 'should not offer a location to a player').toHaveCount(0);

        await panel.locator('.people-panel__field-guild select').selectOption('NPC');
        await expect(panel.locator('.people-panel__location'), 'should offer it once the guild is NPC').toBeVisible();

        await panel.locator('.people-panel__location-input').fill('abc');
        await expect(panel.locator('.people-panel__error')).toBeVisible();
        await expect(panel.locator('button', {hasText: 'Zapisz'})).toBeDisabled();
    });
});

test.describe('People browser – layout', () => {
    test('a narrow window shows the list or the panel, not both', async ({page}) => {
        await page.setViewportSize({width: 390, height: 700});
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        const list = popup.locator('.people-browser__list');
        await popup.locator('.people-browser__item').filter({hasText: 'Aldous'}).click();

        const panel = personPanel(page);
        await expect(panel).toBeVisible();
        await expect(list, 'should hide the list while a person is open').not.toBeVisible();

        await panel.locator('.people-panel__back').click();
        await expect(list, 'should bring the list back').toBeVisible();
        await expect(panel).toHaveCount(0);
    });

    test('a medium window shows the list and the panel side by side', async ({page}) => {
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        const popup = peopleBrowserPopup(page);
        await expect(popup.locator('.people-browser__panel-empty'), 'should invite picking someone').toBeVisible();

        await openPerson(page, 'Aldous');
        await expect(popup.locator('.people-browser__list')).toBeVisible();
        await expect(personPanel(page).locator('.people-panel__back'), 'should not need a back link').not.toBeVisible();
        await expect(popup.locator('.people-browser__head'), 'should keep two-line rows without column headers').not.toBeVisible();
    });

    test('a wide window shows a table with a location column', async ({page}) => {
        await page.setViewportSize({width: 1600, height: 900});
        await prepareClient(page);
        await openPeopleBrowser(page);
        await waitForPeopleLoaded(page);

        await widenPopup(page, 1200);
        const popup = peopleBrowserPopup(page);
        const head = popup.locator('.people-browser__head');
        await expect(head, 'should show column headers').toBeVisible();
        await expect(head).toContainText('Lokacja');

        await openPerson(page, 'Eryk');
        const cols = personPanel(page).locator('.people-panel__col');
        const [left, right] = [await cols.nth(0).boundingBox(), await cols.nth(1).boundingBox()];
        expect(right!.x, 'should split the panel into two columns').toBeGreaterThan(left!.x + left!.width - 1);
    });
});
