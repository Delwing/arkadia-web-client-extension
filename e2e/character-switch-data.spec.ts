import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    primeCharInfo,
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

async function waitForOutputContaining(page: import('@playwright/test').Page, text: string, timeout = 3000) {
    await page.waitForFunction(
        (searchText) => {
            const wrapper = document.querySelector('#main_text_output_msg_wrapper');
            if (!wrapper) return false;
            const messages = wrapper.querySelectorAll('.output_msg');
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 10); i--) {
                if (messages[i].textContent?.includes(searchText)) return true;
            }
            return false;
        },
        text,
        {timeout}
    );
}

test.describe('Profession character switch', () => {
    test('profession state is isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as ProfCharA and initialize profession tracking
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ProfCharA', object_num: 80001});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ProfCharA'
        );

        await submitCommand(page, '/staz 0');
        await waitForOutputContaining(page, 'Rozpoczeto trening zawodu');

        // Send bonus text
        await pushText(page, 'Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu.');
        await page.waitForTimeout(200);

        // Verify CharA has profession data
        const charAProfession = await page.evaluate(() =>
            localStorage.getItem('ProfCharA:profession')
        );
        expect(charAProfession, 'ProfCharA should have profession data').toBeTruthy();

        // Switch to ProfCharB
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ProfCharB', object_num: 80002});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ProfCharB'
        );
        await page.waitForTimeout(200);

        // ProfCharB should have no profession data
        const charBProfession = await page.evaluate(() =>
            localStorage.getItem('ProfCharB:profession')
        );
        expect(charBProfession, 'ProfCharB should have no profession data').toBeNull();

        // /staz for ProfCharB should say not initialized
        await submitCommand(page, '/staz');
        await waitForOutputContaining(page, 'nie zostalo zainicjalizowane');

        // Switch back to ProfCharA — data should be restored
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ProfCharA', object_num: 80001});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ProfCharA'
        );
        await page.waitForTimeout(200);

        await submitCommand(page, '/staz');
        await waitForOutputContaining(page, 'Zawod ukonczony w');

        const output = await getRecentOutput(page, 3);
        expect(output, 'ProfCharA should still show profession percentage').toContain('%');
    });
});

test.describe('Introduced character switch', () => {
    test('remembered names are isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as IntroCharA and set remembered names
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'IntroCharA', object_num: 80003});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'IntroCharA'
        );

        await submitCommand(page, 'zapamietani');
        await page.waitForTimeout(50);
        await pushText(page, 'Zapamietane przez ciebie imiona to Adas, Bodas i Codas.');
        await waitForOutputContaining(page, '[3]');

        // Verify storage
        const charARemembered = await page.evaluate(() =>
            localStorage.getItem('IntroCharA:introduced_remembered')
        );
        expect(charARemembered, 'IntroCharA should have remembered names stored').toBeTruthy();
        expect(JSON.parse(charARemembered!)).toEqual(['Adas', 'Bodas', 'Codas']);

        // Switch to IntroCharB
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'IntroCharB', object_num: 80004});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'IntroCharB'
        );
        await page.waitForTimeout(200);

        // IntroCharB should have no remembered names
        const charBRemembered = await page.evaluate(() =>
            localStorage.getItem('IntroCharB:introduced_remembered')
        );
        expect(charBRemembered, 'IntroCharB should have no remembered names').toBeNull();

        // When IntroCharB runs zapamietani with different names, no deletion message should appear
        await submitCommand(page, 'zapamietani');
        await page.waitForTimeout(50);
        await pushText(page, 'Zapamietane przez ciebie imiona to Xander i Yara.');
        await waitForOutputContaining(page, '[2]');

        const output = await getRecentOutput(page, 5);
        expect(output, 'should not show deletion message for CharB').not.toContain('Osoby usuniete');

        // Switch back to IntroCharA
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'IntroCharA', object_num: 80003});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'IntroCharA'
        );
        await page.waitForTimeout(200);

        // Verify IntroCharA's names are preserved
        const charARememberedAfter = await page.evaluate(() =>
            localStorage.getItem('IntroCharA:introduced_remembered')
        );
        expect(JSON.parse(charARememberedAfter!), 'IntroCharA names should be preserved').toEqual(
            ['Adas', 'Bodas', 'Codas']
        );
    });
});

test.describe('Language max levels character switch', () => {
    test('max language levels are isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as LangCharA and capture max levels
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'LangCharA', object_num: 80005});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'LangCharA'
        );

        await submitCommand(page, 'jezyki maksymalne');
        await page.waitForTimeout(200);
        await pushText(page, 'Krasnoludzki: bardzo dobra\nElficki: doskonala');
        await page.waitForTimeout(300);

        // Verify CharA has max levels stored
        const charALevels = await page.evaluate(() =>
            localStorage.getItem('LangCharA:language_max_levels')
        );
        expect(charALevels, 'LangCharA should have max language levels').toBeTruthy();
        const parsed = JSON.parse(charALevels!);
        expect(parsed.krasnoludzki, 'krasnoludzki max should be 7 (bardzo dobra)').toBe(7);

        // Switch to LangCharB
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'LangCharB', object_num: 80006});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'LangCharB'
        );
        await page.waitForTimeout(200);

        // LangCharB should have no max levels
        const charBLevels = await page.evaluate(() =>
            localStorage.getItem('LangCharB:language_max_levels')
        );
        expect(charBLevels, 'LangCharB should have no max language levels').toBeNull();

        // When LangCharB runs jezyki, gauges should use default max (10)
        await submitCommand(page, 'jezyki');
        await page.waitForTimeout(200);
        await pushText(page, 'Krasnoludzki: dobra');
        await page.waitForTimeout(300);

        const output = await getRecentOutput(page, 5);
        // dobra = 6, with max 10 → [######----]
        expect(output, 'should show gauge with default max 10').toMatch(/\[#{6}-{4}]/);

        // Switch back to LangCharA — max levels should be restored
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'LangCharA', object_num: 80005});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'LangCharA'
        );
        await page.waitForTimeout(200);

        await submitCommand(page, 'jezyki');
        await page.waitForTimeout(200);
        await pushText(page, 'Krasnoludzki: dobra');
        await page.waitForTimeout(300);

        const outputA = await getRecentOutput(page, 5);
        // dobra = 6, with max 7 (bardzo dobra) → [######-]
        expect(outputA, 'should show gauge with restored max 7').toMatch(/\[#{6}-]/);
    });
});

test.describe('Chat history character switch', () => {
    test('chat history storage is isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as ChatCharA and send chat messages
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ChatCharA', object_num: 80007});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ChatCharA'
        );

        await pushText(page, 'Mowisz Hej from ChatCharA!', {type: 'comm'});
        await pushText(page, 'Ktos mowi Witaj ChatCharA!', {type: 'comm'});
        await page.waitForTimeout(200);

        // Persist chat history by triggering beforeunload
        await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
        await page.waitForTimeout(100);

        // Verify ChatCharA has stored chat data
        const charAChat = await page.evaluate(() =>
            localStorage.getItem('ChatCharA:chat_history')
        );
        expect(charAChat, 'ChatCharA should have stored chat history').toBeTruthy();
        expect(charAChat, 'ChatCharA chat should contain sent message').toContain('ChatCharA');

        // Switch to ChatCharB
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ChatCharB', object_num: 80008});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ChatCharB'
        );
        await page.waitForTimeout(200);

        // ChatCharB should have no stored chat data
        const charBChat = await page.evaluate(() =>
            localStorage.getItem('ChatCharB:chat_history')
        );
        expect(charBChat, 'ChatCharB should have no stored chat history').toBeNull();
    });

    test('chat history restores from storage after reload and switch back', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as ChatRestoreA and generate chat
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ChatRestoreA', object_num: 80009});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ChatRestoreA'
        );

        await pushText(page, 'Mowisz Wiadomosc od ChatRestoreA', {type: 'comm'});
        await page.waitForTimeout(200);

        // Persist and reload to ensure storage is set
        await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as ChatRestoreA again — should load from storage
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ChatRestoreA', object_num: 80009});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ChatRestoreA'
        );
        await page.waitForTimeout(200);

        // Chat should show restored messages
        await submitCommand(page, '/chat');
        await waitForOutputContaining(page, 'Wiadomosc od ChatRestoreA');
    });
});

test.describe('LastLang character switch', () => {
    test('last language setting is isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as LangSetA and set a language
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'LangSetA', object_num: 80011});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'LangSetA'
        );

        // Set language via justaw (the alias hooks into characterStorage)
        await submitCommand(page, 'justaw krasnoludzki');
        await page.waitForTimeout(200);

        // Verify storage
        const charALang = await page.evaluate(() =>
            localStorage.getItem('LangSetA:lastLang')
        );
        expect(charALang, 'LangSetA should have lastLang stored').toBeTruthy();

        // Switch to LangSetB
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'LangSetB', object_num: 80012});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'LangSetB'
        );
        await page.waitForTimeout(200);

        // LangSetB should have no lastLang
        const charBLang = await page.evaluate(() =>
            localStorage.getItem('LangSetB:lastLang')
        );
        expect(charBLang, 'LangSetB should have no lastLang').toBeNull();

        // Switch back to LangSetA — lastLang should be preserved
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'LangSetA', object_num: 80011});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'LangSetA'
        );
        await page.waitForTimeout(200);

        const charALangAfter = await page.evaluate(() =>
            localStorage.getItem('LangSetA:lastLang')
        );
        expect(JSON.parse(charALangAfter!), 'LangSetA lastLang should be preserved').toBe('krasnoludzki');
    });
});

test.describe('Clock domain character switch', () => {
    test.beforeEach(async ({context}) => {
        await context.route('**/api/**', async (route) => {
            await route.abort();
        });
        await context.route('**/*calendar*/**', async (route) => {
            await route.abort();
        });
    });

    test('active clock domain is isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login as ClockCharA
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ClockCharA', object_num: 80013});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ClockCharA'
        );

        // Set Empire time — this sets active domain to Empire
        await pushText(page, 'Jest w przyblizeniu szosta rano, 1 dzien miesiaca Nachhexen wedlug Kalendarza Imperialnego.');
        const clockDisplay = page.locator('#clock-display');
        await expect(clockDisplay).toContainText('06:00');

        // Verify storage
        const charADomain = await page.evaluate(() =>
            localStorage.getItem('ClockCharA:clock_active_domain')
        );
        expect(charADomain, 'ClockCharA should have clock domain stored').toBeTruthy();

        // Switch to ClockCharB
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ClockCharB', object_num: 80014});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ClockCharB'
        );
        await page.waitForTimeout(200);

        // ClockCharB should have no stored domain
        const charBDomain = await page.evaluate(() =>
            localStorage.getItem('ClockCharB:clock_active_domain')
        );
        expect(charBDomain, 'ClockCharB should have no clock domain stored').toBeNull();

        // Switch back to ClockCharA
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ClockCharA', object_num: 80013});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'ClockCharA'
        );
        await page.waitForTimeout(200);

        const charADomainAfter = await page.evaluate(() =>
            localStorage.getItem('ClockCharA:clock_active_domain')
        );
        expect(JSON.parse(charADomainAfter!), 'ClockCharA domain should be preserved').toBe('Empire');
    });
});

test.describe('Lua gags colors character switch', () => {
    test('lua gags color settings are isolated between characters', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'GagColorA'});

        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'GagColorA'
        );

        // Open Walka tab and change a color
        await page.click('#menu-button');
        await page.click('#options-button');
        const modal = page.locator('#options-modal');
        await expect(modal).toBeVisible();
        await modal.locator('button:has-text("Walka")').click();
        await modal.locator('h5:has-text("Ustawienia walki")').waitFor({state: 'visible'});

        const colorInput = modal.locator('input[type="color"]#luaGag-moje_ciosy');
        await colorInput.fill('#ff0000');
        await page.click('#options-save');
        await expect(modal).not.toBeVisible();

        // Verify storage
        const charAColors = await page.evaluate(() => {
            const raw = localStorage.getItem('GagColorA:lua_gags_colors');
            return raw ? JSON.parse(raw) : null;
        });
        expect(charAColors?.moje_ciosy, 'GagColorA should have custom color').toBe('#ff0000');

        // Switch to GagColorB
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'GagColorB'});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'GagColorB'
        );
        await page.waitForTimeout(200);

        // GagColorB should have no stored colors
        const charBColors = await page.evaluate(() =>
            localStorage.getItem('GagColorB:lua_gags_colors')
        );
        expect(charBColors, 'GagColorB should have no lua gags colors').toBeNull();

        // Open Walka tab for GagColorB — color should be default
        await page.click('#menu-button');
        await page.click('#options-button');
        const modal2 = page.locator('#options-modal');
        await expect(modal2).toBeVisible();
        await modal2.locator('button:has-text("Walka")').click();
        await modal2.locator('h5:has-text("Ustawienia walki")').waitFor({state: 'visible'});

        const colorInputB = modal2.locator('input[type="color"]#luaGag-moje_ciosy');
        // Default color for moje_ciosy is #f0f8ff
        await expect(colorInputB, 'GagColorB should show default color').toHaveValue('#f0f8ff');

        await modal2.locator('.btn-close').first().click();
        await expect(modal2).not.toBeVisible();

        // Switch back to GagColorA
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'GagColorA'});
        await page.waitForFunction(() =>
            localStorage.getItem('currentCharacter') === 'GagColorA'
        );
        await page.waitForTimeout(200);

        // Verify GagColorA's colors are preserved
        const charAColorsAfter = await page.evaluate(() => {
            const raw = localStorage.getItem('GagColorA:lua_gags_colors');
            return raw ? JSON.parse(raw) : null;
        });
        expect(charAColorsAfter?.moje_ciosy, 'GagColorA color should be preserved').toBe('#ff0000');
    });
});
