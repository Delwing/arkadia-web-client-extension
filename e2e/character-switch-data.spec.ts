import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    pushGmcp,
    pushText,
    GMCP_PATHS,
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

async function simulateHerbBagScan(
    page: import('@playwright/test').Page,
    bags: { content: string }[],
) {
    await submitCommand(page, '/ziola_buduj');
    await page.waitForTimeout(200);

    const bagCount = bags.length;
    const countWord = bagCount === 1 ? 'jednej' : bagCount === 2 ? 'dwoch' : 'trzech';
    await pushText(page, `Doliczyles sie ${countWord} sztuki.`);
    await page.waitForTimeout(200);

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

const PACKAGE_BOARD_TEXT = [
    'Tablica zawiera liste adresatow przesylek, ktore mozesz tutaj pobrac:',
    ' o============================================================================o',
    ' |                Adresat badz                     Cena          Czas na      |',
    ' |               urzad pocztowy                  zl/sr/md      dostarczenie   |',
    ' o -------------------------------------------------------------------------- o',
    ' |   1. Borgaf Kriegmann                          0/ 4/ 2        nieogr.      |',
    ' o -------------------------------------------------------------------------- o',
    ' |      Symbolem * oznaczono przesylki ciezkie.                               |',
    ' o============================================================================o',
].join('\n');

test.describe('Character switch clears per-character data', () => {
    test('herbs are cleared when switching to character with no herbs', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as CharA and scan herbs
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'HerbCharA', object_num: 70001});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'HerbCharA'
        );

        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi i dwie male jagody'},
        ]);
        await page.waitForTimeout(500);

        // Verify herbs are stored for CharA
        const charAHerbs = await page.evaluate(() =>
            localStorage.getItem('HerbCharA:herb_counts')
        );
        expect(charAHerbs, 'CharA should have stored herb data').toBeTruthy();

        // Open herb popup and verify herbs are shown
        await submitCommand(page, '/ziola');
        await page.waitForTimeout(300);
        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup, 'should show herb manager for CharA').toBeVisible({timeout: 5000});

        const herbManager = page.locator('.herb-manager');
        await expect(herbManager).toBeVisible();
        // Should NOT show the empty "run /ziola_buduj" message
        const statusBefore = page.locator('.herb-manager-status');
        await expect(statusBefore).not.toBeVisible();

        // Close the popup
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Switch to CharB (no herbs scanned)
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'HerbCharB', object_num: 70002});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'HerbCharB'
        );
        await page.waitForTimeout(200);

        // Verify CharB has no stored herb data
        const charBHerbs = await page.evaluate(() =>
            localStorage.getItem('HerbCharB:herb_counts')
        );
        expect(charBHerbs, 'CharB should have no stored herb data').toBeNull();

        // Open herb popup for CharB - should show empty state
        await submitCommand(page, '/ziola');
        await page.waitForTimeout(300);
        const herbPopupB = page.locator('.herb-window');
        await expect(herbPopupB, 'should show herb manager for CharB').toBeVisible({timeout: 5000});

        // Should show the empty state message (prompting to run /ziola_buduj)
        const statusAfter = page.locator('.herb-manager-status');
        await expect(statusAfter, 'should show empty state for CharB').toContainText('ziola_buduj');
    });

    test('herbs restore when switching back to original character', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as CharA and scan herbs
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'HerbRestoreA', object_num: 70003});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'HerbRestoreA'
        );

        await simulateHerbBagScan(page, [
            {content: 'trzy jasnozielone lodygi'},
        ]);
        await page.waitForTimeout(500);

        // Switch to CharB (no herbs)
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'HerbRestoreB', object_num: 70004});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'HerbRestoreB'
        );
        await page.waitForTimeout(200);

        // Switch back to CharA
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'HerbRestoreA', object_num: 70003});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'HerbRestoreA'
        );
        await page.waitForTimeout(200);

        // Open herb popup - should show CharA's herbs
        await submitCommand(page, '/ziola');
        await page.waitForTimeout(300);
        const herbPopup = page.locator('.herb-window');
        await expect(herbPopup, 'should show herb manager for CharA').toBeVisible({timeout: 5000});

        // Should NOT show empty state
        const status = page.locator('.herb-manager-status');
        await expect(status, 'should not show empty state after switching back').not.toBeVisible();
    });

    test('pretty containers work with default settings (no stored settings)', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as a fresh character with NO stored settings
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'FreshContChar', object_num: 70005});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'FreshContChar'
        );

        // Verify no settings stored for this character
        const settings = await page.evaluate(() =>
            localStorage.getItem('FreshContChar:settings')
        );
        expect(settings, 'fresh character should have no stored settings').toBeNull();

        // Send a container line that should trigger pretty container formatting
        await pushText(page,
            'Otwarty skorzany plecak zawiera sztylet, miecz i tarcze.'
        );
        await page.waitForTimeout(500);

        const output = await getRecentOutput(page, 5);
        // Pretty containers reformats the output into a table with POJEMNIK header
        expect(output, 'should show formatted container output').toContain('POJEMNIK');
    });

    test('pretty containers work after switching to character with no settings', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as CharA with explicit settings
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ContCharA', object_num: 70006});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ContCharA'
        );

        // Store settings for CharA with prettyContainers enabled
        await page.evaluate(() => {
            localStorage.setItem('ContCharA:settings', JSON.stringify({
                prettyContainers: true,
                containerColumns: 2,
            }));
        });
        await page.waitForTimeout(100);

        // Switch to CharB with NO stored settings
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ContCharB', object_num: 70007});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ContCharB'
        );
        await page.waitForTimeout(200);

        // Verify CharB has no settings
        const charBSettings = await page.evaluate(() =>
            localStorage.getItem('ContCharB:settings')
        );
        expect(charBSettings, 'CharB should have no stored settings').toBeNull();

        // Send container line - should still trigger pretty containers (default = true)
        await pushText(page,
            'Otwarty skorzany plecak zawiera sztylet, miecz i tarcze.'
        );
        await page.waitForTimeout(500);

        const output = await getRecentOutput(page, 5);
        expect(output, 'should show formatted container output for CharB').toContain('POJEMNIK');
    });

    test('package helper remains enabled after switching to character with no settings', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as PkgCharA with explicit settings where packageHelper is true
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'PkgCharA', object_num: 70008});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'PkgCharA'
        );

        await page.evaluate(() => {
            localStorage.setItem('PkgCharA:settings', JSON.stringify({
                packageHelper: true,
            }));
        });
        await page.waitForTimeout(100);

        // Switch to PkgCharB with NO stored settings
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'PkgCharB', object_num: 70009});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'PkgCharB'
        );
        await page.waitForTimeout(300);

        // Verify PkgCharB has no settings stored
        const charBSettings = await page.evaluate(() =>
            localStorage.getItem('PkgCharB:settings')
        );
        expect(charBSettings, 'PkgCharB should have no stored settings').toBeNull();

        // Send a package board - should be processed because packageHelper defaults to true
        await pushText(page, PACKAGE_BOARD_TEXT);
        await page.waitForTimeout(500);

        // Package helper reformats the board and adds distance columns with "dystans:" label
        const boardMessage = page
            .locator('#main_text_output_msg_wrapper .output_msg')
            .filter({hasText: 'Borgaf Kriegmann'})
            .last();

        await expect(boardMessage, 'should display the package board').toBeVisible({timeout: 5000});
        await expect(
            boardMessage,
            'package helper should add distance column when defaultSettings apply (packageHelper: true)'
        ).toContainText('dystans:');
    });

    test('short exits stay disabled after switching to character with no settings', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as ExitCharA with shortenExits explicitly enabled
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ExitCharA', object_num: 70010});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ExitCharA'
        );

        await page.evaluate(() => {
            localStorage.setItem('ExitCharA:settings', JSON.stringify({
                shortenExits: true,
            }));
        });
        await page.waitForTimeout(100);

        // Switch to ExitCharB with NO stored settings
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ExitCharB', object_num: 70011});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ExitCharB'
        );
        await page.waitForTimeout(300);

        // Verify ExitCharB has no settings stored
        const charBSettings = await page.evaluate(() =>
            localStorage.getItem('ExitCharB:settings')
        );
        expect(charBSettings, 'ExitCharB should have no stored settings').toBeNull();

        // Send an exit line - shortenExits defaults to false so it should NOT be shortened
        await pushText(page, 'Jest tutaj 5 widocznych wyjsc: polnoc, poludnie, wschod, zachod i gora.');
        await page.waitForTimeout(500);

        const output = await getRecentOutput(page, 5);

        // When shortenExits is off, the line is printed as-is
        // When shortenExits is on, it becomes "-----: N S E W U"
        expect(output, 'exit line should not be shortened when defaultSettings apply (shortenExits: false)').not.toContain('-----:');
        expect(output, 'original exit text should remain visible').toContain('widocznych wyjsc');
    });

    test('collect coin settings correctly reset to defaults on character switch', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as CollectCharA with collectCopper explicitly disabled
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CollectCharA', object_num: 70012});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'CollectCharA'
        );

        await page.evaluate(() => {
            localStorage.setItem('CollectCharA:settings', JSON.stringify({
                collectCopper: false,
                collectSilver: false,
                collectGold: false,
            }));
        });
        await page.waitForTimeout(100);

        // Switch to CollectCharB with NO stored settings
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CollectCharB', object_num: 70013});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'CollectCharB'
        );
        await page.waitForTimeout(300);

        // Verify CollectCharB has no settings stored
        const charBSettings = await page.evaluate(() =>
            localStorage.getItem('CollectCharB:settings')
        );
        expect(charBSettings, 'CollectCharB should have no stored settings').toBeNull();

        // Open options modal and verify that collect coin checkboxes show defaults (all true)
        await page.click('#menu-button');
        await page.click('#options-button');
        const optionsModal = page.locator('#options-modal');
        await expect(optionsModal, 'should open options modal').toBeVisible();

        await expect(
            optionsModal.locator('#collectCopper'),
            'collectCopper should default to checked when CharB has no stored settings'
        ).toBeChecked();
        await expect(
            optionsModal.locator('#collectSilver'),
            'collectSilver should default to checked when CharB has no stored settings'
        ).toBeChecked();
        await expect(
            optionsModal.locator('#collectGold'),
            'collectGold should default to checked when CharB has no stored settings'
        ).toBeChecked();

        // Close modal without saving using the X button
        await optionsModal.locator('.btn-close').first().click();
        await expect(optionsModal).not.toBeVisible();

        // Switch back to CollectCharA and verify its stored (non-default) values are shown
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CollectCharA', object_num: 70012});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'CollectCharA'
        );
        await page.waitForTimeout(300);

        await page.click('#menu-button');
        await page.click('#options-button');
        const optionsModalA = page.locator('#options-modal');
        await expect(optionsModalA, 'should open options modal for CharA').toBeVisible();

        await expect(
            optionsModalA.locator('#collectCopper'),
            'collectCopper should be unchecked for CharA (was explicitly set to false)'
        ).not.toBeChecked();
        await expect(
            optionsModalA.locator('#collectSilver'),
            'collectSilver should be unchecked for CharA (was explicitly set to false)'
        ).not.toBeChecked();
        await expect(
            optionsModalA.locator('#collectGold'),
            'collectGold should be unchecked for CharA (was explicitly set to false)'
        ).not.toBeChecked();

        await optionsModalA.locator('.btn-close').first().click();
        await expect(optionsModalA).not.toBeVisible();
    });
});
