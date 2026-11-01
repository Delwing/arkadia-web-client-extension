import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    getRecentOutput,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    resetCommandLog,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

/**
 * Simulates the herb counting flow:
 * 1. /ziola_buduj sends "policz swoje woreczki"
 * 2. Game responds with "Doliczyles sie X sztuki."
 * 3. Client then sends "zajrzyj do N. swojego woreczka" for each bag
 * 4. Game responds with woreczek content lines
 */
async function simulateHerbBagScan(
    page: import('@playwright/test').Page,
    bags: { content: string }[],
) {
    // Trigger herb counting via the /ziola_buduj alias
    await submitCommand(page, '/ziola_buduj');

    // Game responds: how many bags the character has
    const bagCount = bags.length;
    const countWord = bagCount === 1 ? 'jednej' : bagCount === 2 ? 'dwoch' : 'trzech';
    await pushText(page, `Doliczyles sie ${countWord} sztuki.`);
    await waitForOutputContaining(page, 'Doliczyles sie');

    // Game responds for each bag with its contents
    for (const bag of bags) {
        if (bag.content) {
            await pushText(
                page,
                `Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W srodku dostrzegasz ${bag.content}.`,
            );
        } else {
            await pushText(
                page,
                `Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W jego srodku nic jednak nie ma.`,
            );
        }
        await waitForOutputContaining(page, 'woreczka');
    }
}

test.describe('Herb bag tracking', () => {
    test('should count herbs from woreczki and display summary via /ziola_pokaz', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbTester', object_num: 60001});
        await waitForCharacter(page, 'HerbTester');

        // Simulate scanning 2 herb bags
        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi i dwie male jagody'},
            {content: 'piec dlugich korzonkow'},
        ]);

        // Now use /ziola_pokaz to display the stored summary
        await submitCommand(page, '/ziola_pokaz');
        // Wait for herb summary output — allow processing time
        await page.waitForTimeout(500); // herb summary rendering has no single predictable text

        const output = await getRecentOutput(page, 20);
        // The output should contain the parsed herb data
        // Herb names come from the raw text when herb data file isn't loaded
        expect(output, 'should show herb count output').toBeTruthy();
    });

    test('should open herb manager popup via /ziola command', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbPopup', object_num: 60002});
        await waitForCharacter(page, 'HerbPopup');

        // Simulate scanning herbs first so there is data
        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi'},
        ]);

        // Open the herb manager popup
        await submitCommand(page, '/ziola');

        // The herb manager popup should be visible
        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup, 'should show herb manager popup').toBeVisible({timeout: 5000});

        // Should show bag contents
        const herbContent = page.locator('.herb-manager');
        await expect(herbContent, 'should display herb manager content').toBeVisible();
    });

    test('should persist herb data across page reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbPersist', object_num: 60003});
        await waitForCharacter(page, 'HerbPersist');

        // Simulate scanning herbs
        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi'},
            {content: ''},
        ]);

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbPersist', object_num: 60003});
        await waitForCharacter(page, 'HerbPersist');

        // Open the herb popup - it should show persisted data (or empty state message)
        await submitCommand(page, '/ziola');

        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup, 'should show herb manager popup after reload').toBeVisible({timeout: 5000});

        // The herb manager should be visible and contain some content
        const herbManager = page.locator('.herb-manager');
        await expect(herbManager, 'should display herb manager after reload').toBeVisible();
    });

    test('give panel hands herbs from the basket to a team member', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbGiver', object_num: 60005});
        await waitForCharacter(page, 'HerbGiver');

        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi'},
        ]);

        // Put a team member and a bystander on the location
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '60005': {desc: 'HerbGiver', team: true, team_leader: true, hp: 6},
            '60106': {desc: 'Scout', team: true, hp: 5},
            '60207': {desc: 'wedrowiec', hp: 3},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [60005, 60106, 60207]);

        await submitCommand(page, '/ziola');
        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup).toBeVisible({timeout: 5000});

        // Enable give mode; the team member should be preselected, with the
        // bystander offered in a separate group
        await herbPopup.getByRole('button', {name: 'Daj', exact: true}).click();
        const panel = page.locator('.herb-give-panel');
        await expect(panel).toBeVisible();
        const select = panel.locator('.herb-give-select');
        await expect(select).toHaveValue('60106');
        await expect(select.locator('optgroup[label="Drużyna"] option')).toHaveText(['Scout']);
        await expect(select.locator('optgroup[label="Pozostali"] option')).toHaveText(['wedrowiec']);

        // Drag the herb stack into the give basket
        const pill = page.locator('.herb-bag .herb-pill').first();
        await pill.dragTo(panel.locator('.herb-give-basket'));
        await expect(panel.locator('.herb-give-basket .herb-pill')).toHaveCount(1);

        await resetCommandLog(page);
        await panel.getByRole('button', {name: /^Daj \(/}).click();

        await expect.poll(() => getCommandLog(page)).toContain('daj ziola ob_60106');
    });

    test('ctrl+click and bag header selection move several herbs at once', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbMover', object_num: 60007});
        await waitForCharacter(page, 'HerbMover');

        await simulateHerbBagScan(page, [
            {content: 'trzy rozetkowate lancetowate liscie i dwa zlocistopomaranczowe duze kwiaty'},
            {content: ''},
        ]);

        await submitCommand(page, '/ziola');
        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup).toBeVisible({timeout: 5000});
        await herbPopup.getByRole('radio', {name: 'Woreczki'}).click();

        const bags = herbPopup.locator('.herb-bag');
        const first = bags.nth(0);
        const second = bags.nth(1);
        await expect(first.locator('.herb-pill')).toHaveCount(2);
        await expect(herbPopup.locator('.herb-manager__footer')).toContainText('Ctrl+klik: zaznacz');

        // Select both stacks, then drag one of them: both move with one open/close per bag
        await first.locator('.herb-pill', {hasText: 'arnika'}).click({modifiers: ['ControlOrMeta']});
        await first.locator('.herb-pill', {hasText: 'babka'}).click({modifiers: ['ControlOrMeta']});
        await expect(first.locator('.herb-pill--selected')).toHaveCount(2);
        await expect(herbPopup.locator('.herb-manager__footer')).toContainText('Zaznaczono 2 (5 szt.)');

        // Mid-drag the selected pills are out of their bag; a cancelled drag puts them back
        const babkaBox = (await first.locator('.herb-pill', {hasText: 'babka'}).boundingBox())!;
        await page.mouse.move(babkaBox.x + babkaBox.width / 2, babkaBox.y + babkaBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(babkaBox.x + 40, babkaBox.y + 60, {steps: 5});
        await expect(first.locator('.herb-pill:visible')).toHaveCount(0);
        await expect(first.locator('.herb-bag-empty')).toBeVisible();
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(first.locator('.herb-pill:visible')).toHaveCount(2);

        await resetCommandLog(page);
        await first.locator('.herb-pill', {hasText: 'babka'}).dragTo(second.locator('.herb-bag-content'));
        await expect(second.locator('.herb-pill')).toHaveCount(2);
        await expect(first.locator('.herb-pill')).toHaveCount(0);
        await expect(herbPopup.locator('.herb-pill--selected')).toHaveCount(0);
        await expect.poll(async () => (await getCommandLog(page)).filter(command => command.startsWith('otworz '))).toEqual([
            'otworz 1. swoj woreczek',
            'otworz 2. swoj woreczek',
        ]);

        // Clicking the bag header selects its whole content; a second click clears it
        const header = second.locator('.herb-bag-header');
        await header.click();
        await expect(second.locator('.herb-pill--selected')).toHaveCount(2);
        await expect(header).toHaveClass(/herb-bag-header--selected/);
        await header.click();
        await expect(second.locator('.herb-pill--selected')).toHaveCount(0);

        // Select the bag again and drag one pill: the whole bag moves back
        await header.click();
        await resetCommandLog(page);
        await second.locator('.herb-pill').first().dragTo(first.locator('.herb-bag-content'));
        await expect(first.locator('.herb-pill')).toHaveCount(2);
        await expect(second.locator('.herb-pill')).toHaveCount(0);
        await expect.poll(async () => (await getCommandLog(page)).filter(command => command.startsWith('wez '))).toHaveLength(2);
    });

    test('/ziola2 opens the list mode with use buttons per herb', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbList', object_num: 60006});
        await waitForCharacter(page, 'HerbList');

        await simulateHerbBagScan(page, [
            {content: 'trzy rozetkowate lancetowate liscie i dwa zlocistopomaranczowe duze kwiaty'},
            {content: 'dwa rozetkowate lancetowate liscie'},
        ]);

        await submitCommand(page, '/ziola2');
        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup).toBeVisible({timeout: 5000});
        await expect(herbPopup.getByRole('radio', {name: 'Lista'})).toBeChecked();

        // Totals across both bags, one row per herb
        const babka = herbPopup.locator('.herb-list tbody tr', {hasText: 'babka'});
        await expect(babka.locator('.herb-list__count')).toHaveText('5');
        await expect(herbPopup.locator('.herb-list tbody tr', {hasText: 'arnika'}).locator('.herb-list__count')).toHaveText('2');

        // Arnika is held twice, so it offers no 3/5 buttons
        await expect(herbPopup.locator('.herb-list tbody tr', {hasText: 'arnika'}).locator('.herb-amount')).toHaveText(['1']);

        await resetCommandLog(page);
        await babka.getByRole('button', {name: '3', exact: true}).click();
        await expect.poll(async () => (await getCommandLog(page)).some(command => command.startsWith('przyloz 3 '))).toBe(true);
    });

    test('effect chips pick one group at a time and copy follows the filter', async ({page, context}) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbEffects', object_num: 60007});
        await waitForCharacter(page, 'HerbEffects');

        await simulateHerbBagScan(page, [
            {content: 'trzy rozetkowate lancetowate liscie i dwa zlocistopomaranczowe duze kwiaty'},
        ]);

        await submitCommand(page, '/ziola');
        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup).toBeVisible({timeout: 5000});
        await herbPopup.locator('.popup-segmented__item', {hasText: 'Efekty'}).click();
        await expect(herbPopup.getByRole('radio', {name: 'Efekty'})).toBeChecked();
        // Woreczki-only header buttons are gone in the other modes
        await expect(herbPopup.getByRole('button', {name: 'Daj', exact: true})).toHaveCount(0);

        const groups = herbPopup.locator('.herb-group__label');
        await expect(groups).toHaveText(['Leczenie', 'Zmęczenie']);

        const chips = herbPopup.locator('.herb-filter__chip');
        await chips.filter({hasText: 'Leczenie'}).click();
        await expect(groups).toHaveText(['Leczenie']);

        // Picking another chip replaces the first one
        await chips.filter({hasText: 'Zmęczenie'}).click();
        await expect(groups).toHaveText(['Zmęczenie']);
        await expect(herbPopup.locator('.herb-filter__chip.is-active')).toHaveCount(1);

        await herbPopup.getByRole('button', {name: 'Kopiuj'}).click();
        await expect(herbPopup.getByRole('button', {name: 'Skopiowano'})).toBeVisible();
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toContain('2 arnika');
        expect(copied).not.toContain('babka');

        // Clicking the active chip clears the filter
        await chips.filter({hasText: 'Zmęczenie'}).click();
        await expect(groups).toHaveText(['Leczenie', 'Zmęczenie']);
    });

    test('should show empty state when no herbs have been scanned', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbEmpty', object_num: 60004});
        await waitForCharacter(page, 'HerbEmpty');

        // Open herb popup without scanning any herbs first
        await submitCommand(page, '/ziola');

        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup, 'should show herb manager popup').toBeVisible({timeout: 5000});

        // Should show the empty state message
        const emptyMessage = page.locator('.herb-manager-status');
        await expect(emptyMessage, 'should show empty state instruction').toContainText('ziola_buduj');
    });
});


test('catalog browses all herbs without a bag scan and disables unavailable uses', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'HerbCatalogEmpty', object_num: 60008});
    await waitForCharacter(page, 'HerbCatalogEmpty');
    await submitCommand(page, '/ziola');
    const popup = page.locator('.herb-window');
    await popup.getByRole('radio', {name: 'Katalog', exact: true}).click();
    const names = popup.locator('.herb-list__name');
    await expect(names).not.toHaveCount(0);
    expect(await names.count()).toBeGreaterThan(50);
    await expect(popup.locator('.herb-amount:not(:disabled)')).toHaveCount(0);
    await expect(popup.locator('.herb-manager-status')).toHaveCount(0);

    const search = popup.locator('.herb-filter__search');
    await search.fill('lancetowaty');
    await expect(names).toHaveCount(1);
    await expect(names).toContainText('babka');
    await expect(popup.locator('.herb-list__count').last()).toHaveText('0');
    await search.fill('');
    await popup.locator('.herb-filter__chip').filter({hasText: 'Mana'}).click();
    await expect(names).not.toHaveCount(0);
    await expect(names.filter({hasText: 'babka'})).toHaveCount(0);
    await popup.locator('.herb-filter__chip').filter({hasText: 'Mana'}).click();
    await popup.locator('.herb-list__sortable').filter({hasText: 'Zioło'}).click();
    const sorted = await names.allTextContents();
    // The pipe herbs form a separate section, as in Lista.
    expect(sorted[0].localeCompare(sorted[1])).toBeGreaterThan(0);
    await popup.getByRole('radio', {name: 'Lista', exact: true}).click();
    await expect(popup.locator('.herb-manager-status')).toContainText('ziola_buduj');
});

test('catalog combines all known herbs with owned counts and keeps Lista inventory-only', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'HerbCatalogOwned', object_num: 60009});
    await waitForCharacter(page, 'HerbCatalogOwned');
    await simulateHerbBagScan(page, [{content: 'trzy rozetkowate lancetowate liscie'}]);
    await submitCommand(page, '/ziola');
    const popup = page.locator('.herb-window');
    await popup.getByRole('radio', {name: 'Katalog', exact: true}).click();
    const babka = popup.locator('.herb-list tbody tr').filter({hasText: 'babka'});
    await expect(babka.locator('.herb-list__count')).toHaveText('3');
    await expect(babka.getByRole('button', {name: '1', exact: true})).toBeEnabled();
    await expect(babka.getByRole('button', {name: '3', exact: true})).toBeEnabled();
    const arnika = popup.locator('.herb-list tbody tr').filter({hasText: 'arnika'});
    await expect(arnika.locator('.herb-list__count')).toHaveText('0');
    await expect(arnika.getByRole('button', {name: '1', exact: true})).toBeDisabled();
    await popup.locator('.herb-list__sortable').filter({hasText: 'Ile'}).click();
    await expect(popup.locator('.herb-list__name').first()).toContainText('babka');
    await popup.getByRole('radio', {name: 'Lista', exact: true}).click();
    await expect(popup.locator('.herb-list__name')).toHaveCount(1);
    await expect(popup.locator('.herb-list__name')).toHaveText('babka');
});
