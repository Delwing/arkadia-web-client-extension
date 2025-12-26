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
