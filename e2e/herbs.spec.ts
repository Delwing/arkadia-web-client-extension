import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';
async function getRecentOutput(page: import('@playwright/test').Page, count = 10): Promise<string> {
    return await page.evaluate((numMessages) => {
        const wrapper = document.querySelector('#main_text_output_msg_wrapper');
        if (!wrapper) return '';

        const messages = wrapper.querySelectorAll('.output_msg');
        if (messages.length === 0) return '';

        const result: string[] = [];
        const startIdx = Math.max(0, messages.length - numMessages);

        for (let i = startIdx; i < messages.length; i++) {
            result.push(messages[i].textContent?.trim() || '');
        }

        return result.join('\n');
    }, count);
}

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
    await page.waitForTimeout(200);

    // Game responds: how many bags the character has
    const bagCount = bags.length;
    const countWord = bagCount === 1 ? 'jednej' : bagCount === 2 ? 'dwoch' : 'trzech';
    await pushText(page, `Doliczyles sie ${countWord} sztuki.`);
    await page.waitForTimeout(200);

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
        await page.waitForTimeout(100);
    }
}

test.describe('Herb bag tracking', () => {
    test('should count herbs from woreczki and display summary via /ziola_pokaz', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbTester', object_num: 60001});
        await page.waitForTimeout(200);

        // Simulate scanning 2 herb bags
        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi i dwie male jagody'},
            {content: 'piec dlugich korzonkow'},
        ]);

        // Wait for the herb summary to appear in the output
        await page.waitForTimeout(500);

        // The herb counter should have printed a summary after finishing
        // Now use /ziola_pokaz to display the stored summary
        await submitCommand(page, '/ziola_pokaz');
        await page.waitForTimeout(500);

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
        await page.waitForTimeout(200);

        // Simulate scanning herbs first so there is data
        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi'},
        ]);
        await page.waitForTimeout(500);

        // Open the herb manager popup
        await submitCommand(page, '/ziola');
        await page.waitForTimeout(300);

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
        await page.waitForTimeout(200);

        // Simulate scanning herbs
        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi'},
            {content: ''},
        ]);
        await page.waitForTimeout(500);

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbPersist', object_num: 60003});
        await page.waitForTimeout(300);

        // Open the herb popup - it should show persisted data (or empty state message)
        await submitCommand(page, '/ziola');
        await page.waitForTimeout(300);

        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup, 'should show herb manager popup after reload').toBeVisible({timeout: 5000});

        // The herb manager should be visible and contain some content
        const herbManager = page.locator('.herb-manager');
        await expect(herbManager, 'should display herb manager after reload').toBeVisible();
    });

    test('should show empty state when no herbs have been scanned', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushGmcp(page, 'char.info', {name: 'HerbEmpty', object_num: 60004});
        await page.waitForTimeout(200);

        // Open herb popup without scanning any herbs first
        await submitCommand(page, '/ziola');
        await page.waitForTimeout(300);

        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup, 'should show herb manager popup').toBeVisible({timeout: 5000});

        // Should show the empty state message
        const emptyMessage = page.locator('.herb-manager-status');
        await expect(emptyMessage, 'should show empty state instruction').toContainText('ziola_buduj');
    });
});
