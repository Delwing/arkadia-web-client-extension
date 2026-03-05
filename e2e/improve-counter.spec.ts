import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    pushGmcp,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

async function waitForOutputContaining(page: Page, text: string, timeout: number = 5000) {
    await page.waitForFunction(
        (searchText) => {
            const wrapper = document.querySelector('#main_text_output_msg_wrapper');
            if (!wrapper) return false;

            const messages = wrapper.querySelectorAll('.output_msg');
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 20); i--) {
                const msg = messages[i];
                const textContent = msg.textContent || '';
                if (textContent.includes(searchText)) {
                    return true;
                }
            }
            return false;
        },
        text,
        {timeout}
    );
}

async function getRecentOutput(page: Page, count: number = 15): Promise<string> {
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

async function loginWithChar(page: Page, name: string, objectNum: number) {
    await pushGmcp(page, 'char.info', {name, object_num: objectNum});
    await page.waitForTimeout(200);
}

async function enterCombat(page: Page, objectNum: number) {
    await pushGmcp(page, 'objects.data', {
        [objectNum]: {attack_num: 99999},
    });
    await page.waitForTimeout(100);
}

async function sendImprove(page: Page, level: number) {
    await pushGmcp(page, 'char.state', {improve: level});
    await page.waitForTimeout(100);
}

test.describe('Improve counter', () => {
    test('records improve entries and displays them via /postepy', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login with character
        await loginWithChar(page, 'ImproveHero', 12345);

        // Enter combat so combat state is active
        await enterCombat(page, 12345);

        // Send initial improve state (0 = no improvement yet)
        await sendImprove(page, 0);

        // Improve level increases (this should record entries)
        await sendImprove(page, 1);
        await sendImprove(page, 2);

        // Verify output shows improve notification
        await waitForOutputContaining(page, 'wbiles postepy');

        // Check /postepy table
        await submitCommand(page, '/postepy');
        await waitForOutputContaining(page, 'Postepy');

        const output = await getRecentOutput(page, 20);
        expect(output, 'should show Postepy header').toContain('Postepy');
        expect(output, 'should show Dzisiaj count > 0').toMatch(/Dzisiaj:\s*[1-9]/);
    });

    test('displays lifetime stats via /postepy2', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await loginWithChar(page, 'LifetimeHero', 22222);

        // Enter combat
        await enterCombat(page, 22222);

        // Generate some improvements
        await sendImprove(page, 0);
        await sendImprove(page, 1);
        await sendImprove(page, 2);
        await sendImprove(page, 3);
        await page.waitForTimeout(200);

        // Check lifetime table
        await submitCommand(page, '/postepy2');
        await waitForOutputContaining(page, 'WSZYSTKICH DO TEJ PORY');

        const output = await getRecentOutput(page, 20);
        expect(output, 'should show POSTAC label').toContain('POSTAC');
        expect(output, 'should show lifetime total').toContain('WSZYSTKICH DO TEJ PORY');
        expect(output, 'should show postepow count').toContain('postepow');
    });

    test('session data persists across page reload with same object_num', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await loginWithChar(page, 'PersistHero', 33333);

        // Enter combat and improve
        await enterCombat(page, 33333);
        await sendImprove(page, 0);
        await sendImprove(page, 1);
        await sendImprove(page, 2);
        await page.waitForTimeout(200);

        // Verify postepy are recorded before reload
        await submitCommand(page, '/postepy');
        await waitForOutputContaining(page, 'Postepy');

        let output = await getRecentOutput(page, 20);
        expect(output, 'should show improvements before reload').toMatch(/Dzisiaj:\s*[1-9]/);

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login again with SAME object_num
        await loginWithChar(page, 'PersistHero', 33333);

        // Re-send current improve level (game would send this on reconnect)
        await sendImprove(page, 2);
        await page.waitForTimeout(200);

        // Verify session data persisted
        await submitCommand(page, '/postepy');
        await waitForOutputContaining(page, 'Postepy');

        output = await getRecentOutput(page, 20);
        expect(output, 'should still show improvements after reload').toMatch(/Dzisiaj:\s*[1-9]/);
    });

    test('session counter resets with different object_num', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await loginWithChar(page, 'ResetHero', 44444);

        // Enter combat and generate improvements
        await enterCombat(page, 44444);
        await sendImprove(page, 0);
        await sendImprove(page, 1);
        await sendImprove(page, 2);
        await page.waitForTimeout(200);

        // Verify improvements were recorded
        await submitCommand(page, '/postepy');
        await waitForOutputContaining(page, 'Postepy');

        let output = await getRecentOutput(page, 20);
        expect(output, 'should have improvements before respawn').toMatch(/Dzisiaj:\s*[1-9]/);

        // Simulate character death/respawn with DIFFERENT object_num
        await pushGmcp(page, 'char.info', {name: 'ResetHero', object_num: 44445});
        await page.waitForTimeout(200);

        // Verify session counter is reset (Dzisiaj: 0)
        await submitCommand(page, '/postepy');
        await waitForOutputContaining(page, 'Postepy');

        output = await getRecentOutput(page, 20);
        expect(output, 'should show Dzisiaj: 0 after respawn').toMatch(/Dzisiaj:\s*0/);
    });
});
