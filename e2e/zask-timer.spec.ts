import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushGmcp, waitForCommandInput} from './support/mocks';

// Toggle move mode using the default keybind (Backquote = `)
// Mode cycles: 0 (normal) -> 1 (sneak) -> 0 (normal)
async function toggleMoveMode(page: Page) {
    await page.keyboard.press('Backquote');
}

async function triggerRoomChange(page: Page) {
    await pushGmcp(page, 'room.info', {
        num: 1,
        name: 'Test Room',
        zone: 'test',
        area: 'test',
        exits: {}
    });
}

test.describe('Zask timer', () => {
    test('starts counting when entering sneak mode and changing rooms', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const zaskTimer = page.locator('#zask-timer');

        // Initially, the timer should be hidden
        await expect(zaskTimer, 'should be hidden initially').not.toBeVisible();

        // Enable sneak mode (przemknij) by pressing the move mode toggle key
        await toggleMoveMode(page);

        // Change room to trigger the timer
        await triggerRoomChange(page);

        // Timer should start at 0 seconds with red color
        await expect(zaskTimer, 'should be visible after entering sneak mode').toBeVisible();
        await expect(zaskTimer, 'should display 0 seconds initially').toHaveText('Zask: 0');

        // Check that the value "0" is red (tomato)
        const valueSpan = zaskTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have red color at 0 seconds').toHaveCSS('color', 'rgb(255, 99, 71)'); // tomato
    });

    test('shows red color for first 20 seconds', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const zaskTimer = page.locator('#zask-timer');

        // Enable sneak mode
        await toggleMoveMode(page);
        await triggerRoomChange(page);

        // Wait a few seconds
        await page.clock.runFor(3000);

        // Should still be red
        await expect(zaskTimer, 'should display countdown in red').toContainText('Zask: ');

        // Check that the value is red (tomato)
        const valueSpan = zaskTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have red color before 20 seconds').toHaveCSS('color', 'rgb(255, 99, 71)'); // tomato

        const timerText = await zaskTimer.textContent();
        const seconds = parseInt(timerText?.replace('Zask: ', '') || '0');
        expect(seconds, 'should show seconds between 0 and 20').toBeGreaterThanOrEqual(0);
        expect(seconds, 'should show seconds less than 20').toBeLessThan(20);
    });

    test('changes to yellow at 20 seconds', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const zaskTimer = page.locator('#zask-timer');

        // Enable sneak mode
        await toggleMoveMode(page);
        await triggerRoomChange(page);

        // Wait for timer to reach 21 seconds
        await page.clock.runFor(21000);

        await expect(zaskTimer, 'should display countdown at 20+ seconds').toContainText('Zask: ');

        // Check that the value is yellow
        const valueSpan = zaskTimer.locator('span').nth(1);
        await expect(valueSpan, 'should have yellow color at 20+ seconds').toHaveCSS('color', 'rgb(255, 255, 0)'); // yellow

        const timerText = await zaskTimer.textContent();
        const seconds = parseInt(timerText?.replace('Zask: ', '') || '0');
        expect(seconds, 'should show at least 20 seconds').toBeGreaterThanOrEqual(20);
    });

    test('shows OK in green after 30 seconds', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const zaskTimer = page.locator('#zask-timer');

        // Enable sneak mode
        await toggleMoveMode(page);
        await triggerRoomChange(page);

        // Wait for timer to reach 30 seconds (OK state)
        await page.clock.runFor(30000);

        await expect(zaskTimer, 'should display OK after 30 seconds').toHaveText('Zask: OK');

        // Check that the value "OK" is green (springgreen)
        const okSpan = zaskTimer.locator('span').nth(1);
        await expect(okSpan, 'should have green color after 30 seconds').toHaveCSS('color', 'rgb(0, 255, 127)'); // springgreen
    });

    test('stops and hides when exiting sneak mode', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const zaskTimer = page.locator('#zask-timer');

        // Start timer in sneak mode
        await toggleMoveMode(page);
        await triggerRoomChange(page);

        // Timer should be visible
        await expect(zaskTimer, 'should be visible in sneak mode').toBeVisible();

        // Wait a bit
        await page.clock.runFor(2000);

        // Exit sneak mode (toggle back to normal)
        await toggleMoveMode(page);

        // Timer should be hidden
        await expect(zaskTimer, 'should be hidden after exiting sneak mode').not.toBeVisible();
    });

    test('continues timer when changing rooms in sneak mode', async ({page}) => {
        await page.clock.install();
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const zaskTimer = page.locator('#zask-timer');

        // Enable sneak mode
        await toggleMoveMode(page);
        await triggerRoomChange(page);

        // Get initial time
        await page.clock.runFor(2000);
        const firstText = await zaskTimer.textContent();
        const firstSeconds = parseInt(firstText?.replace('Zask: ', '') || '0');

        // Change room again
        await triggerRoomChange(page);

        // Timer should reset and start from 0
        await page.clock.runFor(100);
        const secondText = await zaskTimer.textContent();
        const secondSeconds = parseInt(secondText?.replace('Zask: ', '') || '0');

        expect(secondSeconds, 'should restart timer on room change').toBeLessThanOrEqual(firstSeconds);
    });
});
