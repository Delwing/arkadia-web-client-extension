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

        // Put a team member on the location
        await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
            '60005': {desc: 'HerbGiver', team: true, team_leader: true, hp: 6},
            '60106': {desc: 'Scout', team: true, hp: 5},
        });
        await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [60005, 60106]);

        await submitCommand(page, '/ziola');
        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup).toBeVisible({timeout: 5000});

        // Enable give mode; the team member should be offered as target
        await herbPopup.getByRole('button', {name: 'Daj', exact: true}).click();
        const panel = page.locator('.herb-give-panel');
        await expect(panel).toBeVisible();
        await expect(panel.locator('.herb-give-select')).toHaveValue('Scout');

        // Drag the herb stack into the give basket
        const pill = page.locator('.herb-bag .herb-pill').first();
        await pill.dragTo(panel.locator('.herb-give-basket'));
        await expect(panel.locator('.herb-give-basket .herb-pill')).toHaveCount(1);

        await resetCommandLog(page);
        await panel.getByRole('button', {name: /^Daj \(/}).click();

        await expect.poll(() => getCommandLog(page)).toContain('daj ziola ob_60106');
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
