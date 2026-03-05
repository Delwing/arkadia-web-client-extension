import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';
import type {Page} from '@playwright/test';

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
        {timeout}
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

async function login(page: Page) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
    await page.waitForTimeout(100);
}

test.describe('Profession tracking', () => {
    test('profession bonus text triggers progress tracking and /staz shows percentage', async ({page}) => {
        await login(page);

        // Initialize profession tracking with /staz 0
        await submitCommand(page, '/staz 0');
        await waitForOutputContaining(page, 'Rozpoczeto trening zawodu');
        await page.waitForTimeout(100);

        // Send profession bonus text from the game
        await pushText(page, 'Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu.');
        await page.waitForTimeout(200);

        // Check progress with /staz command
        await submitCommand(page, '/staz');
        await waitForOutputContaining(page, 'Zawod ukonczony w');

        const output = await getRecentOutput(page, 5);
        expect(output, 'should show profession progress percentage').toContain('Zawod ukonczony w');
        // After initialization with 0 and one plus event (3 points), plus time-based points,
        // we should see a percentage
        expect(output, 'should contain percentage sign').toContain('%');
    });

    test('multiple profession bonus texts increment the counter', async ({page}) => {
        await login(page);

        // Initialize profession tracking
        await submitCommand(page, '/staz 0');
        await waitForOutputContaining(page, 'Rozpoczeto trening zawodu');
        await page.waitForTimeout(100);

        // Send first bonus text
        await pushText(page, 'Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu.');
        await page.waitForTimeout(200);

        // Record the output after first bonus
        await submitCommand(page, '/staz');
        await waitForOutputContaining(page, 'Zawod ukonczony w');
        const outputAfterFirst = await getRecentOutput(page, 3);

        // Extract percentage from first check
        const firstMatch = outputAfterFirst.match(/Zawod ukonczony w ([\d.]+)%/);
        expect(firstMatch, 'should find percentage after first bonus').toBeTruthy();
        const firstPercentage = parseFloat(firstMatch![1]);

        // Send second bonus text
        await pushText(page, 'Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu.');
        await page.waitForTimeout(200);

        // Send third bonus text
        await pushText(page, 'Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu.');
        await page.waitForTimeout(200);

        // Check progress again
        await submitCommand(page, '/staz');
        await waitForOutputContaining(page, 'Zawod ukonczony w');
        const outputAfterThird = await getRecentOutput(page, 3);

        const thirdMatch = outputAfterThird.match(/Zawod ukonczony w ([\d.]+)%/);
        expect(thirdMatch, 'should find percentage after third bonus').toBeTruthy();
        const thirdPercentage = parseFloat(thirdMatch![1]);

        // The percentage after 3 bonuses should be higher than after 1 bonus
        expect(thirdPercentage, 'percentage should increase with more bonus events').toBeGreaterThan(firstPercentage);
    });

    test('profession progress persists across page reload', async ({page}) => {
        await login(page);

        // Initialize profession tracking
        await submitCommand(page, '/staz 0');
        await waitForOutputContaining(page, 'Rozpoczeto trening zawodu');
        await page.waitForTimeout(100);

        // Send bonus texts
        await pushText(page, 'Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu.');
        await page.waitForTimeout(200);
        await pushText(page, 'Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu.');
        await page.waitForTimeout(200);

        // Check progress before reload
        await submitCommand(page, '/staz');
        await waitForOutputContaining(page, 'Zawod ukonczony w');
        const outputBefore = await getRecentOutput(page, 3);
        const beforeMatch = outputBefore.match(/Zawod ukonczony w ([\d.]+)%/);
        expect(beforeMatch, 'should show percentage before reload').toBeTruthy();
        const percentageBefore = parseFloat(beforeMatch![1]);

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Re-login with the same character
        await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
        await page.waitForTimeout(200);

        // Check progress after reload
        await submitCommand(page, '/staz');
        await waitForOutputContaining(page, 'Zawod ukonczony w');
        const outputAfter = await getRecentOutput(page, 3);
        const afterMatch = outputAfter.match(/Zawod ukonczony w ([\d.]+)%/);
        expect(afterMatch, 'should show percentage after reload').toBeTruthy();
        const percentageAfter = parseFloat(afterMatch![1]);

        // The percentage should be the same or very close (time may have passed)
        expect(percentageAfter, 'percentage should persist after reload').toBeGreaterThanOrEqual(percentageBefore);
    });
});
