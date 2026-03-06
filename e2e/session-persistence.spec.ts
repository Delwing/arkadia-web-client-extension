import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

async function sendChatMessage(page: Page, message: string) {
    await pushText(page, message, { type: 'comm' });
    await page.waitForTimeout(100);
}

async function waitForOutputContaining(page: Page, text: string, timeout: number = 3000) {
    await page.waitForFunction(
        (searchText) => {
            const wrapper = document.querySelector('#main_text_output_msg_wrapper');
            if (!wrapper) return false;

            const messages = wrapper.querySelectorAll('.output_msg');
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 10); i--) {
                const msg = messages[i];
                const textContent = msg.textContent || '';
                if (textContent.includes(searchText)) {
                    return true;
                }
            }
            return false;
        },
        text,
        { timeout }
    );
}

async function getRecentOutput(page: Page, count: number = 5): Promise<string> {
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

async function simulateKill(page: Page, mobName: string) {
    await pushText(page, `Zabiles ${mobName}.`);
    await page.waitForTimeout(100);
}

test.describe('Session persistence across page reload', () => {
    test.describe('Kill counter', () => {
        test('session kills persist when objNum stays the same on page reload', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login with character - first set the object_num
            await pushGmcp(page, 'char.info', { name: 'KillTester', object_num: 12345 });
            await page.waitForTimeout(200);

            // Kill some mobs
            await simulateKill(page, 'trolla');
            await simulateKill(page, 'trolla');
            await simulateKill(page, 'smoka chaosu');

            // Verify kills are recorded
            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'trolla');

            let output = await getRecentOutput(page, 10);
            expect(output, 'should show 2 trolls killed').toMatch(/trolla.*2|2.*trolla/);
            expect(output, 'should show 1 smoka chaosu killed').toContain('smoka chaosu');

            // Reload page
            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login again with SAME object_num - should NOT trigger reset
            await pushGmcp(page, 'char.info', { name: 'KillTester', object_num: 12345 });
            await page.waitForTimeout(200);

            // Verify session kills are preserved
            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'trolla');

            output = await getRecentOutput(page, 10);
            expect(output, 'should still show 2 trolls after reload').toMatch(/trolla.*2|2.*trolla/);
            expect(output, 'should still show smoka chaosu after reload').toContain('smoka chaosu');
        });

        test('session kills reset when same character dies and respawns (objNum changes)', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login with character
            await pushGmcp(page, 'char.info', { name: 'DeathTester', object_num: 11111 });
            await page.waitForTimeout(200);

            // Kill some mobs
            await simulateKill(page, 'goblina');
            await simulateKill(page, 'goblina');

            // Verify kills are recorded
            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'goblina');

            // Simulate character death and respawn - SAME name but DIFFERENT object_num
            // This happens when character dies and respawns in the game
            await pushGmcp(page, 'char.info', { name: 'DeathTester', object_num: 11112 });
            await page.waitForTimeout(200);

            // Verify session kills are cleared (character died/respawned)
            await submitCommand(page, '/zabici');
            // Wait for the new table to appear with LACZNIE: 0
            await waitForOutputContaining(page, 'LACZNIE:');
            await page.waitForTimeout(100);

            // Get just the last few lines to see the final table
            const output = await getRecentOutput(page, 5);
            // The last table should show zero total, not goblina
            expect(output, 'should show zero total').toMatch(/LACZNIE:.*0/);
            expect(output, 'should show zero team total').toMatch(/DRUZYNA LACZNIE:.*0/);
        });
    });

    test.describe('Postepy (improve counter)', () => {
        test('session postepy persist when objNum stays the same on page reload', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login with character
            await pushGmcp(page, 'char.info', { name: 'PostepyTester', object_num: 33333 });
            await page.waitForTimeout(200);

            // Simulate some improvements
            await pushGmcp(page, 'char.state', { improve: 2 });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 3 });
            await page.waitForTimeout(100);

            // Verify postepy are recorded
            await submitCommand(page, '/postepy');
            await waitForOutputContaining(page, 'Postepy');

            let output = await getRecentOutput(page, 15);
            expect(output, 'should show Dzisiaj count').toMatch(/Dzisiaj:\s*[1-9]/);

            // Reload page
            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login again with SAME object_num
            await pushGmcp(page, 'char.info', { name: 'PostepyTester', object_num: 33333 });
            await page.waitForTimeout(200);

            // Re-send current improve level
            await pushGmcp(page, 'char.state', { improve: 3 });
            await page.waitForTimeout(100);

            // Verify session postepy are preserved
            await submitCommand(page, '/postepy');
            await waitForOutputContaining(page, 'Postepy');

            output = await getRecentOutput(page, 15);
            expect(output, 'should still show Dzisiaj count after reload').toMatch(/Dzisiaj:\s*[1-9]/);
        });

        test('session postepy reset when same character dies and respawns (objNum changes)', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login with character
            await pushGmcp(page, 'char.info', { name: 'PostepyDeath', object_num: 44444 });
            await page.waitForTimeout(200);

            // Simulate some improvements
            await pushGmcp(page, 'char.state', { improve: 2 });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 3 });
            await page.waitForTimeout(100);

            // Verify postepy are recorded
            await submitCommand(page, '/postepy');
            await waitForOutputContaining(page, 'Postepy');

            let output = await getRecentOutput(page, 15);
            expect(output, 'should show improvements before death').toMatch(/Dzisiaj:\s*[1-9]/);

            // Simulate character death and respawn - SAME name but DIFFERENT object_num
            await pushGmcp(page, 'char.info', { name: 'PostepyDeath', object_num: 44445 });
            await page.waitForTimeout(200);

            // Verify session postepy are cleared (character died/respawned)
            await submitCommand(page, '/postepy');
            await waitForOutputContaining(page, 'Postepy');

            output = await getRecentOutput(page, 15);
            expect(output, 'should show Dzisiaj: 0 after death').toMatch(/Dzisiaj:\s*0/);
        });
    });

    test.describe('Kill counter character switch', () => {
        test('session kills are cleared when switching to a different character', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login as CharA and kill some mobs
            await pushGmcp(page, 'char.info', { name: 'KillCharA', object_num: 50001 });
            await page.waitForTimeout(200);

            await simulateKill(page, 'trolla');
            await simulateKill(page, 'trolla');
            await simulateKill(page, 'smoka chaosu');

            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'trolla');

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'KillCharB', object_num: 50002 });
            await page.waitForFunction(() =>
                localStorage.getItem('currentCharacter') === 'KillCharB'
            );
            await page.waitForTimeout(200);

            // CharB session should be empty
            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'DRUZYNA LACZNIE:');
            await page.waitForTimeout(100);

            // Only get the very last table (CharB's)
            const output = await getRecentOutput(page, 2);
            expect(output, 'should show zero total for CharB').toMatch(/LACZNIE:.*0/);
            expect(output, 'should show zero team total for CharB').toMatch(/DRUZYNA LACZNIE:.*0/);
        });

        test('session kills restore when switching back to original character', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login as CharA and kill mobs
            await pushGmcp(page, 'char.info', { name: 'KillRestoreA', object_num: 50003 });
            await page.waitForTimeout(200);

            await simulateKill(page, 'goblina');
            await simulateKill(page, 'goblina');

            // Persist before switch
            await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
            await page.waitForTimeout(100);

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'KillRestoreB', object_num: 50004 });
            await page.waitForFunction(() =>
                localStorage.getItem('currentCharacter') === 'KillRestoreB'
            );
            await page.waitForTimeout(200);

            // Switch back to CharA
            await pushGmcp(page, 'char.info', { name: 'KillRestoreA', object_num: 50003 });
            await page.waitForFunction(() =>
                localStorage.getItem('currentCharacter') === 'KillRestoreA'
            );
            await page.waitForTimeout(200);

            // CharA session kills should be restored
            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'goblina');

            const output = await getRecentOutput(page, 10);
            expect(output, 'should restore CharA kills after switching back').toMatch(/goblina.*2|2.*goblina/);
        });

        test('lifetime kills are isolated between characters', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login as CharA and kill mobs
            await pushGmcp(page, 'char.info', { name: 'LifeKillA', object_num: 50005 });
            await page.waitForTimeout(200);

            await simulateKill(page, 'trolla');
            await simulateKill(page, 'smoka chaosu');
            await page.waitForTimeout(200);

            // Verify CharA lifetime shows kills
            await submitCommand(page, '/zabici2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');

            let output = await getRecentOutput(page, 15);
            expect(output, 'should show CharA lifetime kills').toContain('POSTAC: Lifekilla');
            expect(output, 'should show trolla in CharA lifetime').toContain('trolla');
            expect(output, 'should show smoka chaosu in CharA lifetime').toContain('smoka chaosu');

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'LifeKillB', object_num: 50006 });
            await page.waitForFunction(() =>
                localStorage.getItem('currentCharacter') === 'LifeKillB'
            );
            await page.waitForTimeout(200);

            // CharB lifetime should be empty — only check the last table
            await submitCommand(page, '/zabici2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');
            await page.waitForTimeout(100);

            output = await getRecentOutput(page, 2);
            expect(output, 'should show CharB name').toContain('POSTAC: Lifekillb');
            expect(output, 'should show 0 lifetime kills for CharB').toMatch(/WSZYSTKICH DO TEJ PORY:.*0/);
        });
    });

    test.describe('Postepy character switch', () => {
        test('session postepy are cleared when switching to a different character', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login as CharA, enter combat and improve
            await pushGmcp(page, 'char.info', { name: 'ImprCharA', object_num: 60001 });
            await page.waitForTimeout(200);

            await pushGmcp(page, 'objects.data', { '60001': { attack_num: 99999 } });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 0 });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 1 });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 2 });
            await page.waitForTimeout(200);

            await submitCommand(page, '/postepy');
            await waitForOutputContaining(page, 'Postepy');

            let output = await getRecentOutput(page, 20);
            expect(output, 'should show CharA improvements').toMatch(/Dzisiaj:\s*[1-9]/);

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'ImprCharB', object_num: 60002 });
            await page.waitForFunction(() =>
                localStorage.getItem('currentCharacter') === 'ImprCharB'
            );
            await page.waitForTimeout(200);

            // CharB should have no session improvements
            await submitCommand(page, '/postepy');
            await waitForOutputContaining(page, 'Postepy');

            output = await getRecentOutput(page, 20);
            expect(output, 'should show Dzisiaj: 0 for CharB').toMatch(/Dzisiaj:\s*0/);
        });

        test('lifetime postepy are isolated between characters', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login as CharA, enter combat and improve
            await pushGmcp(page, 'char.info', { name: 'LifeImprA', object_num: 60003 });
            await page.waitForTimeout(200);

            await pushGmcp(page, 'objects.data', { '60003': { attack_num: 99999 } });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 0 });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 1 });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 2 });
            await page.waitForTimeout(200);

            // Verify CharA lifetime
            await submitCommand(page, '/postepy2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');

            let output = await getRecentOutput(page, 20);
            expect(output, 'should show CharA name in lifetime').toContain('POSTAC');
            expect(output, 'should show CharA lifetime improvements').toContain('postepow');

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'LifeImprB', object_num: 60004 });
            await page.waitForFunction(() =>
                localStorage.getItem('currentCharacter') === 'LifeImprB'
            );
            await page.waitForTimeout(200);

            // CharB lifetime should be empty
            await submitCommand(page, '/postepy2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');

            output = await getRecentOutput(page, 20);
            expect(output, 'should show 0 lifetime for CharB').toMatch(/WSZYSTKICH DO TEJ PORY:.*0\s*postepow/);
        });

        test('no false improvement is recorded during character switch', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login as CharA with improve level 3
            await pushGmcp(page, 'char.info', { name: 'NoFalseA', object_num: 60005 });
            await page.waitForTimeout(200);

            await pushGmcp(page, 'objects.data', { '60005': { attack_num: 99999 } });
            await page.waitForTimeout(100);
            await pushGmcp(page, 'char.state', { improve: 3 });
            await page.waitForTimeout(200);

            // Note lifetime count
            await submitCommand(page, '/postepy2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');
            const beforeOutput = await getRecentOutput(page, 20);

            // Switch to CharB with improve level 0
            await pushGmcp(page, 'char.info', { name: 'NoFalseB', object_num: 60006 });
            await page.waitForFunction(() =>
                localStorage.getItem('currentCharacter') === 'NoFalseB'
            );
            await page.waitForTimeout(200);

            await pushGmcp(page, 'char.state', { improve: 0 });
            await page.waitForTimeout(200);

            // Switch back to CharA
            await pushGmcp(page, 'char.info', { name: 'NoFalseA', object_num: 60005 });
            await page.waitForFunction(() =>
                localStorage.getItem('currentCharacter') === 'NoFalseA'
            );
            await page.waitForTimeout(200);

            // Re-send CharA's improve level — should NOT record new improvements
            await pushGmcp(page, 'char.state', { improve: 3 });
            await page.waitForTimeout(200);

            await submitCommand(page, '/postepy2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');
            const afterOutput = await getRecentOutput(page, 20);

            // Extract the lifetime totals from both outputs
            const beforeMatch = beforeOutput.match(/WSZYSTKICH DO TEJ PORY:\s*(\d+)/);
            const afterMatch = afterOutput.match(/WSZYSTKICH DO TEJ PORY:\s*(\d+)/);

            expect(afterMatch, 'should find lifetime total after switch-back').not.toBeNull();
            expect(beforeMatch, 'should find lifetime total before switch').not.toBeNull();
            expect(
                Number(afterMatch![1]),
                'lifetime total should not increase from character switch round-trip'
            ).toBe(Number(beforeMatch![1]));
        });
    });

    test.describe('Chat history', () => {
        test('chat history persists when objNum stays the same on page reload', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login with character
            await pushGmcp(page, 'char.info', { name: 'ChatTester', object_num: 66666 });
            await page.waitForTimeout(200);

            // Simulate some chat messages
            await sendChatMessage(page, 'Ktos mowi: Pierwsza wiadomosc');
            await sendChatMessage(page, 'Ktos mowi: Druga wiadomosc');

            // Verify chat messages are recorded
            await submitCommand(page, '/chat');
            await waitForOutputContaining(page, 'Pierwsza');

            let output = await getRecentOutput(page, 10);
            expect(output, 'should show first message').toContain('Pierwsza wiadomosc');
            expect(output, 'should show second message').toContain('Druga wiadomosc');

            // Trigger beforeunload to persist chat history before reload
            await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
            await page.waitForTimeout(100);

            // Reload page
            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login again with SAME object_num
            await pushGmcp(page, 'char.info', { name: 'ChatTester', object_num: 66666 });
            await page.waitForTimeout(300);

            // Verify chat history is preserved
            await submitCommand(page, '/chat');
            await page.waitForTimeout(500);

            output = await getRecentOutput(page, 15);
            expect(output, 'should still show first message after reload').toContain('Pierwsza wiadomosc');
            expect(output, 'should still show second message after reload').toContain('Druga wiadomosc');
        });

        test('chat history resets when same character dies and respawns (objNum changes)', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login with character
            await pushGmcp(page, 'char.info', { name: 'ChatDeath', object_num: 77777 });
            await page.waitForTimeout(200);

            // Simulate some chat messages
            await sendChatMessage(page, 'Ktos mowi: Stara wiadomosc');

            // Verify chat messages are recorded
            await submitCommand(page, '/chat');
            await waitForOutputContaining(page, 'Stara');

            // Simulate character death and respawn - SAME name but DIFFERENT object_num
            await pushGmcp(page, 'char.info', { name: 'ChatDeath', object_num: 77778 });
            await page.waitForTimeout(200);

            // Verify chat history is cleared (character died/respawned)
            await submitCommand(page, '/chat');
            // Wait for the "no messages" message to appear
            await waitForOutputContaining(page, 'Brak zapisanych');
            await page.waitForTimeout(100);

            // Get just the last few lines
            const output = await getRecentOutput(page, 3);
            expect(output, 'should show no messages').toContain('Brak zapisanych wiadomosci');
        });
    });
});
