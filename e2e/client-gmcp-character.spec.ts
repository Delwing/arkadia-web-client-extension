import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    waitForCommandInput,
    pushGmcp,
    submitCommand,
    getLastOutgoingCommand,
    GMCP_PATHS,
    pushText,
} from './support/mocks';

async function getRecentOutput(page: Page, count = 10): Promise<string> {
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

        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'TestHero',
            {timeout: 5000},
        );

        const stored = await page.evaluate(() => localStorage.getItem('currentCharacter'));
        expect(stored).toBe('TestHero');
    });

    test('char.info character switch changes active character in localStorage', async ({page}) => {
        // Establish first character
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'FirstChar', object_num: 11001});

        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'FirstChar',
            {timeout: 5000},
        );
        expect(await page.evaluate(() => localStorage.getItem('currentCharacter'))).toBe('FirstChar');

        // Switch to second character via GMCP
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'SecondChar', object_num: 11002});

        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'SecondChar',
            {timeout: 5000},
        );
        expect(await page.evaluate(() => localStorage.getItem('currentCharacter'))).toBe('SecondChar');
    });

    test('object_num change triggers reset — chat history is cleared', async ({page}) => {
        // Login with initial object_num 100
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ResetChar', object_num: 100});
        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'ResetChar',
            {timeout: 5000},
        );

        // Send a chat message so chat history is non-empty
        await pushText(page, 'Ktos mowi: Witaj w swiecie!');
        await page.waitForTimeout(200);

        // Verify chat history is not empty by running /chat command
        await submitCommand(page, '/chat');
        await page.waitForTimeout(300);

        // The chat history should have the message (not "Brak zapisanych wiadomosci czatu.")
        const outputWithHistory = await getRecentOutput(page, 10);
        expect(outputWithHistory).not.toContain('Brak zapisanych wiadomosci czatu.');
        expect(outputWithHistory).toContain('Witaj w swiecie');

        // Push char.info again with the SAME name but a DIFFERENT object_num — this triggers reset
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'ResetChar', object_num: 200});
        await page.waitForTimeout(300);

        // After reset the chat history should be cleared
        await submitCommand(page, '/chat');
        await page.waitForTimeout(300);

        const outputAfterReset = await getRecentOutput(page, 10);
        expect(outputAfterReset).toContain('Brak zapisanych wiadomosci czatu.');
    });

    test('same object_num does not trigger reset', async ({page}) => {
        // Login with object_num 300
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'StableChar', object_num: 300});
        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'StableChar',
            {timeout: 5000},
        );

        // Send a chat message
        await pushText(page, 'Ktos mowi: Stary tekst!');
        await page.waitForTimeout(200);

        // Confirm message is in history
        await submitCommand(page, '/chat');
        await page.waitForTimeout(300);
        const outputBefore = await getRecentOutput(page, 10);
        expect(outputBefore).toContain('Stary tekst');

        // Push char.info again with the SAME name AND the same object_num 300 — no reset
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'StableChar', object_num: 300});
        await page.waitForTimeout(300);

        // Chat history should be unchanged (not cleared)
        await submitCommand(page, '/chat');
        await page.waitForTimeout(300);
        const outputAfter = await getRecentOutput(page, 10);
        // History was loaded fresh from storage on the second gmcp.char.info, so it still has the entry
        expect(outputAfter).not.toContain('Brak zapisanych wiadomosci czatu.');
    });

    test('object_num is stored in character-scoped localStorage key', async ({page}) => {
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'NumChar', object_num: 42});
        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'NumChar',
            {timeout: 5000},
        );
        await page.waitForTimeout(100);

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
        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'CharAlpha',
            {timeout: 5000},
        );
        await page.waitForTimeout(100);

        // Open settings and verify CharAlpha's attack command is shown
        let modal = await openOptions(page);
        await expect(
            modal.locator('input[placeholder="zabij"]'),
            'CharAlpha attack command should be atakuj',
        ).toHaveValue('atakuj');
        await closeOptions(page);

        // Switch to CharBeta via GMCP
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'CharBeta'});
        await page.waitForFunction(
            () => localStorage.getItem('currentCharacter') === 'CharBeta',
            {timeout: 5000},
        );
        await page.waitForTimeout(100);

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
        await page.waitForTimeout(200);

        // App should still accept and send commands
        await submitCommand(page, 'rozejrzyj');
        await page.waitForTimeout(200);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand).toBe('rozejrzyj');
    });

    test('char.info with empty object sets no character and app remains functional', async ({page}) => {
        // Push char.info with an empty object — no name, no object_num
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {});
        await page.waitForTimeout(200);

        // App should still accept commands
        await submitCommand(page, 'ekwipunek');
        await page.waitForTimeout(200);

        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand).toBe('ekwipunek');
    });
});
