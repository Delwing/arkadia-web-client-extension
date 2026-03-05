import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    pushGmcp,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';
import type {Page} from '@playwright/test';

async function getRecentOutput(page: Page, count: number = 10): Promise<string> {
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

const LANGUAGE_RESPONSE = [
    'Krasnoludzki: dobra',
    'Elficki: bardzo dobra',
    'Wspolny: pelna',
    'Orkowy: znikoma',
].join('\n');

const MAX_LANGUAGE_RESPONSE = [
    'Krasnoludzki: bardzo dobra',
    'Elficki: doskonala',
    'Wspolny: pelna',
    'Orkowy: dobra',
].join('\n');

test.describe('Language skills', () => {
    test('jezyki command captures language levels and /jezyki shows gauge display', async ({page}) => {
        await login(page);

        // First, send "jezyki maksymalne" to capture max levels.
        // The script hooks onto the bare "jezyki maksymalne" alias.
        await submitCommand(page, 'jezyki maksymalne');
        await page.waitForTimeout(200);

        // Push the max language response from the game
        await pushText(page, MAX_LANGUAGE_RESPONSE);
        await page.waitForTimeout(300);

        // Now send the regular "jezyki" command to capture current levels
        await submitCommand(page, 'jezyki');
        await page.waitForTimeout(200);

        // Push the language response from the game
        await pushText(page, LANGUAGE_RESPONSE);
        await page.waitForTimeout(300);

        // Verify the output contains the language gauge display
        // The script adds color-coded gauge bars like [###---] next to each language
        const output = await getRecentOutput(page, 15);

        // The output should contain the language names
        expect(output, 'should show Krasnoludzki language').toContain('Krasnoludzki');
        expect(output, 'should show Elficki language').toContain('Elficki');
        expect(output, 'should show Wspolny language').toContain('Wspolny');
        expect(output, 'should show Orkowy language').toContain('Orkowy');

        // The gauge display uses # for filled and - for empty, enclosed in brackets
        expect(output, 'should contain gauge characters').toMatch(/[#\-]/);
    });

    test('max language levels persist across page reload', async ({page}) => {
        await login(page);

        // Capture max levels via "jezyki maksymalne"
        await submitCommand(page, 'jezyki maksymalne');
        await page.waitForTimeout(200);
        await pushText(page, MAX_LANGUAGE_RESPONSE);
        await page.waitForTimeout(300);

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Re-login with the same character
        await pushGmcp(page, 'char.info', {name: 'TestChar', object_num: 12345});
        await page.waitForTimeout(200);

        // Now send regular jezyki command - it should use the persisted max levels for gauge display
        await submitCommand(page, 'jezyki');
        await page.waitForTimeout(200);
        await pushText(page, LANGUAGE_RESPONSE);
        await page.waitForTimeout(300);

        // The gauge display should reflect persisted max levels
        const output = await getRecentOutput(page, 15);

        // Verify language names appear in output after reload
        expect(output, 'should show Krasnoludzki after reload').toContain('Krasnoludzki');
        expect(output, 'should show Elficki after reload').toContain('Elficki');
        expect(output, 'should show Wspolny after reload').toContain('Wspolny');
        expect(output, 'should show Orkowy after reload').toContain('Orkowy');

        // The gauge uses # and - characters
        expect(output, 'should contain gauge characters after reload').toMatch(/[#\-]/);
    });

    test('gauge display reflects actual vs max levels', async ({page}) => {
        await login(page);

        // First capture max levels
        await submitCommand(page, 'jezyki maksymalne');
        await page.waitForTimeout(200);
        await pushText(page, MAX_LANGUAGE_RESPONSE);
        await page.waitForTimeout(300);

        // Then capture current levels
        await submitCommand(page, 'jezyki');
        await page.waitForTimeout(200);
        await pushText(page, LANGUAGE_RESPONSE);
        await page.waitForTimeout(300);

        const output = await getRecentOutput(page, 15);

        // Wspolny is pelna (10) with max pelna (10) - should be fully filled [##########]
        // The gauge for a fully maxed skill should have only # characters
        expect(output, 'should show fully filled gauge for pelna/pelna skill').toMatch(/\[#+]/);

        // Orkowy is znikoma (1) with max dobra (6) - should have mostly dashes
        // [#-----] pattern
        expect(output, 'should show partially filled gauge for lower skill').toMatch(/\[#+-+]/);
    });
});
