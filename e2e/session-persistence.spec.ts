import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getRecentOutput,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
    waitForOutputContaining,
} from './support/mocks';

async function sendChatMessage(page: Page, message: string) {
    await pushText(page, message, { type: 'comm' });
    await waitForOutputContaining(page, message.substring(0, 20));
}

async function simulateKill(page: Page, mobName: string) {
    await pushText(page, `Zabiles ${mobName}.`);
    await waitForOutputContaining(page, `Zabiles ${mobName}`);
}

test.describe('Session persistence across page reload', () => {
    test.describe('Kill counter', () => {
        test('session kills persist when objNum stays the same on page reload', async ({page}) => {
            await page.goto('/');
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login with character - first set the object_num
            await pushGmcp(page, 'char.info', { name: 'KillTester', object_num: 12345 });
            await waitForCharacter(page, 'KillTester');

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
            await waitForCharacter(page, 'KillTester');

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
            await waitForCharacter(page, 'DeathTester');

            // Kill some mobs
            await simulateKill(page, 'goblina');
            await simulateKill(page, 'goblina');

            // Verify kills are recorded
            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'goblina');

            // Simulate character death and respawn - SAME name but DIFFERENT object_num
            // This happens when character dies and respawns in the game
            await pushGmcp(page, 'char.info', { name: 'DeathTester', object_num: 11112 });
            await waitForCharacter(page, 'DeathTester');

            // Verify session kills are cleared (character died/respawned)
            await submitCommand(page, '/zabici');
            // Wait for the new table to appear with LACZNIE: 0
            await waitForOutputContaining(page, 'LACZNIE:');

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
            await waitForCharacter(page, 'PostepyTester');

            // Simulate some improvements
            await pushGmcp(page, 'char.state', { improve: 2 });
            await pushGmcp(page, 'char.state', { improve: 3 });

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
            await waitForCharacter(page, 'PostepyTester');

            // Re-send current improve level
            await pushGmcp(page, 'char.state', { improve: 3 });

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
            await waitForCharacter(page, 'PostepyDeath');

            // Simulate some improvements
            await pushGmcp(page, 'char.state', { improve: 2 });
            await pushGmcp(page, 'char.state', { improve: 3 });

            // Verify postepy are recorded
            await submitCommand(page, '/postepy');
            await waitForOutputContaining(page, 'Postepy');

            let output = await getRecentOutput(page, 15);
            expect(output, 'should show improvements before death').toMatch(/Dzisiaj:\s*[1-9]/);

            // Simulate character death and respawn - SAME name but DIFFERENT object_num
            await pushGmcp(page, 'char.info', { name: 'PostepyDeath', object_num: 44445 });
            await waitForCharacter(page, 'PostepyDeath');

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
            await waitForCharacter(page, 'KillCharA');

            await simulateKill(page, 'trolla');
            await simulateKill(page, 'trolla');
            await simulateKill(page, 'smoka chaosu');

            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'trolla');

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'KillCharB', object_num: 50002 });
            await waitForCharacter(page, 'KillCharB');

            // CharB session should be empty
            await submitCommand(page, '/zabici');
            await waitForOutputContaining(page, 'DRUZYNA LACZNIE:');

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
            await waitForCharacter(page, 'KillRestoreA');

            await simulateKill(page, 'goblina');
            await simulateKill(page, 'goblina');

            // Persist before switch
            await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'KillRestoreB', object_num: 50004 });
            await waitForCharacter(page, 'KillRestoreB');

            // Switch back to CharA
            await pushGmcp(page, 'char.info', { name: 'KillRestoreA', object_num: 50003 });
            await waitForCharacter(page, 'KillRestoreA');

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
            await waitForCharacter(page, 'LifeKillA');

            await simulateKill(page, 'trolla');
            await simulateKill(page, 'smoka chaosu');

            // Verify CharA lifetime shows kills
            await submitCommand(page, '/zabici2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');

            let output = await getRecentOutput(page, 15);
            expect(output, 'should show CharA lifetime kills').toContain('POSTAC: Lifekilla');
            expect(output, 'should show trolla in CharA lifetime').toContain('trolla');
            expect(output, 'should show smoka chaosu in CharA lifetime').toContain('smoka chaosu');

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'LifeKillB', object_num: 50006 });
            await waitForCharacter(page, 'LifeKillB');

            // CharB lifetime should be empty — only check the last table
            await submitCommand(page, '/zabici2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');

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
            await waitForCharacter(page, 'ImprCharA');

            await pushGmcp(page, 'objects.data', { '60001': { attack_num: 99999 } });
            await pushGmcp(page, 'char.state', { improve: 0 });
            await pushGmcp(page, 'char.state', { improve: 1 });
            await pushGmcp(page, 'char.state', { improve: 2 });

            await submitCommand(page, '/postepy');
            await waitForOutputContaining(page, 'Postepy');

            let output = await getRecentOutput(page, 20);
            expect(output, 'should show CharA improvements').toMatch(/Dzisiaj:\s*[1-9]/);

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'ImprCharB', object_num: 60002 });
            await waitForCharacter(page, 'ImprCharB');

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
            await waitForCharacter(page, 'LifeImprA');

            await pushGmcp(page, 'objects.data', { '60003': { attack_num: 99999 } });
            await pushGmcp(page, 'char.state', { improve: 0 });
            await pushGmcp(page, 'char.state', { improve: 1 });
            await pushGmcp(page, 'char.state', { improve: 2 });

            // Verify CharA lifetime
            await submitCommand(page, '/postepy2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');

            let output = await getRecentOutput(page, 20);
            expect(output, 'should show CharA name in lifetime').toContain('POSTAC');
            expect(output, 'should show CharA lifetime improvements').toContain('postepow');

            // Switch to CharB
            await pushGmcp(page, 'char.info', { name: 'LifeImprB', object_num: 60004 });
            await waitForCharacter(page, 'LifeImprB');

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
            await waitForCharacter(page, 'NoFalseA');

            await pushGmcp(page, 'objects.data', { '60005': { attack_num: 99999 } });
            await pushGmcp(page, 'char.state', { improve: 3 });

            // Note lifetime count
            await submitCommand(page, '/postepy2');
            await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');
            const beforeOutput = await getRecentOutput(page, 20);

            // Switch to CharB with improve level 0
            await pushGmcp(page, 'char.info', { name: 'NoFalseB', object_num: 60006 });
            await waitForCharacter(page, 'NoFalseB');

            await pushGmcp(page, 'char.state', { improve: 0 });

            // Switch back to CharA
            await pushGmcp(page, 'char.info', { name: 'NoFalseA', object_num: 60005 });
            await waitForCharacter(page, 'NoFalseA');

            // Re-send CharA's improve level — should NOT record new improvements
            await pushGmcp(page, 'char.state', { improve: 3 });

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
            await waitForCharacter(page, 'ChatTester');

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

            // Reload page
            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);

            // Login again with SAME object_num
            await pushGmcp(page, 'char.info', { name: 'ChatTester', object_num: 66666 });
            await waitForCharacter(page, 'ChatTester');

            // Verify chat history is preserved
            await submitCommand(page, '/chat');
            await waitForOutputContaining(page, 'Pierwsza');

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
            await waitForCharacter(page, 'ChatDeath');

            // Simulate some chat messages
            await sendChatMessage(page, 'Ktos mowi: Stara wiadomosc');

            // Verify chat messages are recorded
            await submitCommand(page, '/chat');
            await waitForOutputContaining(page, 'Stara');

            // Simulate character death and respawn - SAME name but DIFFERENT object_num
            await pushGmcp(page, 'char.info', { name: 'ChatDeath', object_num: 77778 });
            await waitForCharacter(page, 'ChatDeath');

            // Verify chat history is cleared (character died/respawned)
            await submitCommand(page, '/chat');
            // Wait for the "no messages" message to appear
            await waitForOutputContaining(page, 'Brak zapisanych');

            // Get just the last few lines
            const output = await getRecentOutput(page, 3);
            expect(output, 'should show no messages').toContain('Brak zapisanych wiadomosci');
        });
    });
});
