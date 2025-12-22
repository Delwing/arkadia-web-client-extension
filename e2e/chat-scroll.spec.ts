import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    primeCharInfo,
    pushText,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

async function prepareClient(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    await page.waitForFunction(() => localStorage.getItem('currentCharacter') === 'Tester');
}

async function openChatPopup(page: Page): Promise<void> {
    await submitCommand(page, '/chatw');
    // Wait for the messages container which exists in both regular and managed layout modes
    await page.locator('.chat-popup__messages').waitFor({state: 'visible'});
}

async function enableLayoutManager(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#ui-settings-button');
    const modal = page.locator('#ui-settings-modal');
    await expect(modal).toBeVisible();

    const layoutToggle = modal.locator('#ui-layout-manager-enabled');
    if (!(await layoutToggle.isChecked())) {
        await layoutToggle.check();
    }

    await modal.locator('#ui-settings-save').click();
    await expect(modal).not.toBeVisible();

    // Wait for layout manager to be enabled
    await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
}

async function sendChatMessage(page: Page, message: string): Promise<void> {
    await pushText(page, message, {type: 'comm'});
}

test.describe('Chat popup scroll', () => {
    test('scrolls to bottom when new messages arrive', async ({page}) => {
        await prepareClient(page);
        await openChatPopup(page);

        const messagesContainer = page.locator('.chat-popup__messages');
        await expect(messagesContainer).toBeVisible();

        // Send enough messages to make the container scrollable
        for (let i = 1; i <= 20; i++) {
            await sendChatMessage(page, `Test message number ${i}`);
        }

        // Wait for messages to render
        await page.waitForTimeout(100);

        // Verify messages appeared
        const messageCount = await messagesContainer.locator('.chat-popup__message').count();
        expect(messageCount).toBeGreaterThanOrEqual(20);

        // Check that container is scrolled to bottom
        const isAtBottom = await messagesContainer.evaluate((el) => {
            return el.scrollHeight - el.scrollTop - el.clientHeight < 5;
        });
        expect(isAtBottom, 'should be scrolled to bottom after messages').toBe(true);

        // Send one more message and verify it scrolls to bottom again
        await sendChatMessage(page, 'Final message after scroll check');
        await page.waitForTimeout(100);

        const isStillAtBottom = await messagesContainer.evaluate((el) => {
            return el.scrollHeight - el.scrollTop - el.clientHeight < 5;
        });
        expect(isStillAtBottom, 'should remain scrolled to bottom after new message').toBe(true);
    });

    test('does not auto-scroll when user scrolls up', async ({page}) => {
        await prepareClient(page);
        await openChatPopup(page);

        const messagesContainer = page.locator('.chat-popup__messages');
        await expect(messagesContainer).toBeVisible();

        // Send messages to make container scrollable
        for (let i = 1; i <= 20; i++) {
            await sendChatMessage(page, `Message ${i}`);
        }
        await page.waitForTimeout(100);

        // Scroll up manually
        await messagesContainer.evaluate((el) => {
            el.scrollTop = 0;
        });
        await page.waitForTimeout(50);

        // Send a new message
        await sendChatMessage(page, 'New message while scrolled up');
        await page.waitForTimeout(100);

        // Verify it did NOT scroll to bottom (user scrolled up)
        const scrollTop = await messagesContainer.evaluate((el) => el.scrollTop);
        expect(scrollTop, 'should stay at top when user scrolled up').toBeLessThan(50);
    });

    test('resumes auto-scroll when user scrolls back to bottom', async ({page}) => {
        await prepareClient(page);
        await openChatPopup(page);

        const messagesContainer = page.locator('.chat-popup__messages');
        await expect(messagesContainer).toBeVisible();

        // Send messages
        for (let i = 1; i <= 20; i++) {
            await sendChatMessage(page, `Message ${i}`);
        }
        await page.waitForTimeout(100);

        // Scroll up
        await messagesContainer.evaluate((el) => {
            el.scrollTop = 0;
        });
        await page.waitForTimeout(50);

        // Scroll back to bottom
        await messagesContainer.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });
        await page.waitForTimeout(50);

        // Send new message
        await sendChatMessage(page, 'Message after scrolling back to bottom');
        await page.waitForTimeout(100);

        // Verify auto-scroll resumed
        const isAtBottom = await messagesContainer.evaluate((el) => {
            return el.scrollHeight - el.scrollTop - el.clientHeight < 5;
        });
        expect(isAtBottom, 'should auto-scroll after user scrolled back to bottom').toBe(true);
    });

    test('scrolls to bottom in managed layout mode', async ({page}) => {
        await prepareClient(page);
        await enableLayoutManager(page);
        await openChatPopup(page);

        const messagesContainer = page.locator('.chat-popup__messages');
        await expect(messagesContainer).toBeVisible();

        // Send enough messages to make the container scrollable
        for (let i = 1; i <= 20; i++) {
            await sendChatMessage(page, `Managed layout message ${i}`);
        }

        // Wait for messages to render - managed layout needs more time
        await page.waitForTimeout(200);

        // Verify messages appeared
        const messageCount = await messagesContainer.locator('.chat-popup__message').count();
        expect(messageCount).toBeGreaterThanOrEqual(20);

        // Check that container is scrolled to bottom
        const isAtBottom = await messagesContainer.evaluate((el) => {
            return el.scrollHeight - el.scrollTop - el.clientHeight < 5;
        });
        expect(isAtBottom, 'should be scrolled to bottom in managed layout').toBe(true);

        // Send more messages and verify it keeps scrolling
        await sendChatMessage(page, 'Another message in managed layout');
        await page.waitForTimeout(100);

        const isStillAtBottom = await messagesContainer.evaluate((el) => {
            return el.scrollHeight - el.scrollTop - el.clientHeight < 5;
        });
        expect(isStillAtBottom, 'should remain scrolled to bottom after new message in managed layout').toBe(true);
    });
});
