import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getRecentOutput,
    waitForCommandInput,
    pushGmcp,
    submitCommand,
    getLastOutgoingCommand,
    GMCP_PATHS,
    pushText,
    waitForCharacter,
    waitForOutputContaining,
} from './support/mocks';

async function openOptions(page: Page) {
    await page.click('#menu-button');
    await page.click('#options-button');
    const modal = page.locator('#options-modal');
    await expect(modal, 'should open options modal').toBeVisible();
    return modal;
}

async function closeOptions(page: Page) {
    await page.locator('#options-modal .btn-close').first().click();
    await expect(page.locator('#options-modal'), 'options modal should close').not.toBeVisible();
}

test.describe('GMCP char.info character handlers', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        // Note: do NOT call primeCharInfo here — these tests specifically test the char.info handler
    });

    test('char.info sets currentCharacter in localStorage', async ({page}) => {
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'TestHero', object_num: 12345});

        await waitForCharacter(page, 'TestHero');

        const stored = await page.evaluate(() => localStorage.getItem('currentCharacter'));
        expect(stored).toBe('TestHero');
    });

    test('char.info character switch changes active character in localStorage', async ({page}) => {
        // Establish first character
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'FirstChar', object_num: 11001});
        await waitForCharacter(page, 'FirstChar');
        expect(await page.evaluate(() => localStorage.getItem('currentCharacter'))).toBe('FirstChar');

        // Switch to second character via GMCP
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'SecondChar', object_num: 11002});
        await waitForCharacter(page, 'SecondChar');
        expect(await page.evaluate(() => localStorage.getItem('currentCharacter'))).toBe('SecondChar');
    });

    test('object_num change triggers reset — chat history is cleared', async ({page}) => {
        // Login with initial object_num 100
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ResetChar', object_num: 100});
        await waitForCharacter(page, 'ResetChar');

        // Send a chat message so chat history is non-empty
        await pushText(page, 'Ktos mowi: Witaj w swiecie!');
        await waitForOutputContaining(page, 'Witaj w swiecie');

        // Verify chat history is not empty by running /chat command
        await submitCommand(page, '/chat');
        await waitForOutputContaining(page, 'Witaj w swiecie');

        // The chat history should have the message (not "Brak zapisanych wiadomosci czatu.")
        const outputWithHistory = await getRecentOutput(page, 10);
        expect(outputWithHistory).not.toContain('Brak zapisanych wiadomosci czatu.');
        expect(outputWithHistory).toContain('Witaj w swiecie');

        // Push char.info again with the SAME name but a DIFFERENT object_num — this triggers reset
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ResetChar', object_num: 200});
        // Wait for reset to process - object_num change is still ResetChar
        await page.waitForTimeout(300);

        // After reset the chat history should be cleared
        await submitCommand(page, '/chat');
        await waitForOutputContaining(page, 'Brak zapisanych wiadomosci czatu.');

        const outputAfterReset = await getRecentOutput(page, 10);
        expect(outputAfterReset).toContain('Brak zapisanych wiadomosci czatu.');
    });

    test('same object_num does not trigger reset', async ({page}) => {
        // Login with object_num 300
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'StableChar', object_num: 300});
        await waitForCharacter(page, 'StableChar');

        // Send a chat message
        await pushText(page, 'Ktos mowi: Stary tekst!');
        await waitForOutputContaining(page, 'Stary tekst');

        // Confirm message is in history
        await submitCommand(page, '/chat');
        await waitForOutputContaining(page, 'Stary tekst');
        const outputBefore = await getRecentOutput(page, 10);
        expect(outputBefore).toContain('Stary tekst');

        // Push char.info again with the SAME name AND the same object_num 300 — no reset
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'StableChar', object_num: 300});
        // Brief wait — no character name change to poll for
        await page.waitForTimeout(200); // same object_num, no observable state change to wait for

        // Chat history should be unchanged (not cleared)
        await submitCommand(page, '/chat');
        await waitForOutputContaining(page, 'Stary tekst');
        const outputAfter = await getRecentOutput(page, 10);
        // History was loaded fresh from storage on the second gmcp.char.info, so it still has the entry
        expect(outputAfter).not.toContain('Brak zapisanych wiadomosci czatu.');
    });

    test('object_num is stored in character-scoped localStorage key', async ({page}) => {
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'NumChar', object_num: 42});
        await waitForCharacter(page, 'NumChar');

        const storedNum = await page.evaluate(() => localStorage.getItem('NumChar:object_num'));
        expect(storedNum).toBe('"42"');
    });

    test('character switch loads correct per-character settings via GMCP flow', async ({page}) => {
        // Pre-seed settings for CharAlpha and CharBeta before any GMCP fires
        await page.evaluate(() => {
            localStorage.setItem('CharAlpha:settings', JSON.stringify({attackCommand: 'atakuj'}));
            localStorage.setItem('CharBeta:settings', JSON.stringify({attackCommand: 'napadnij'}));
        });

        // Activate CharAlpha via GMCP
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharAlpha'});
        await waitForCharacter(page, 'CharAlpha');

        // Open settings and verify CharAlpha's attack command is shown
        let modal = await openOptions(page);
        await expect(
            modal.locator('input[placeholder="zabij"]'),
            'CharAlpha attack command should be atakuj',
        ).toHaveValue('atakuj');
        await closeOptions(page);

        // Switch to CharBeta via GMCP
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharBeta'});
        await waitForCharacter(page, 'CharBeta');

        // Open settings and verify CharBeta's attack command is shown
        modal = await openOptions(page);
        await expect(
            modal.locator('input[placeholder="zabij"]'),
            'CharBeta attack command should be napadnij',
        ).toHaveValue('napadnij');
        await closeOptions(page);
    });

    test('char.info with no name field does not crash and app remains functional', async ({page}) => {
        // Push char.info without a name field — should be a no-op for character storage
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {object_num: 999});
        // No character name to wait for, brief wait for processing
        await page.waitForTimeout(200); // no name field — no observable state change to wait for

        // App should still accept and send commands
        await submitCommand(page, 'rozejrzyj');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'app should send command after no-name char.info',
                timeout: 3000,
            })
            .toBe('rozejrzyj');
    });

    test('char.info with empty object sets no character and app remains functional', async ({page}) => {
        // Push char.info with an empty object — no name, no object_num
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {});
        // No character name to wait for, brief wait for processing
        await page.waitForTimeout(200); // empty object — no observable state change to wait for

        // App should still accept commands
        await submitCommand(page, 'ekwipunek');

        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'app should send command after empty char.info',
                timeout: 3000,
            })
            .toBe('ekwipunek');
    });
});
