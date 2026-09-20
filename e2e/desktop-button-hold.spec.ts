import { expect, test } from './support/fixtures';
import { countSentCommand, ensureGameSocket, resetCommandLog, waitForCommandInput } from './support/mocks';

const TAP_COMMAND = 'rozejrzyj sie';
const HOLD_COMMAND = 'dobadz miecza';

const desktopButtonSettings = {
    buttons: [
        {
            id: 'desktop-btn-hold',
            label: 'Rozejrzyj',
            macroType: 'command',
            command: TAP_COMMAND,
            color: '#0d6efd',
            fontColor: '#f1f5f9',
            fontSize: 11,
            width: 80,
            height: 36,
            x: 120,
            y: 120,
            backgroundOpacity: 0.85,
            holdEnabled: true,
            hold: { macroType: 'command', command: HOLD_COMMAND },
        },
    ],
    locked: true,
};

/**
 * A finger tap is followed by a compatibility mouse burst (mousedown/mouseup/
 * click) a millisecond after touchend, and a hold-enabled button listens on
 * both paths — so the whole point of these tests is counting sends, not just
 * observing that something was sent.
 */
const MOUSE_BURST_GRACE = 400;

test.describe('Desktop button with a hold action', () => {
    const prepare = async (page: import('@playwright/test').Page) => {
        await page.addInitScript((settings) => {
            localStorage.setItem('desktopButtonSettings', JSON.stringify(settings));
        }, desktopButtonSettings);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await resetCommandLog(page);
    };

    const buttonCenter = async (page: import('@playwright/test').Page) => {
        const btn = page.locator('#desktop-buttons-container .desktop-button').first();
        await expect(btn).toBeVisible();
        const box = (await btn.boundingBox())!;
        return { btn, x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    };

    test.describe('touch interaction', () => {
        test.use({ hasTouch: true });

        test.beforeEach(async ({ page }) => {
            await page.setViewportSize({ width: 420, height: 860 });
            await prepare(page);
        });

        test('a tap sends the regular command exactly once', async ({ page }) => {
            const { btn } = await buttonCenter(page);
            await btn.tap();

            await expect.poll(
                async () => await countSentCommand(page, TAP_COMMAND),
                { message: 'tap macro should have run', timeout: 5000 },
            ).toBe(1);

            await page.waitForTimeout(MOUSE_BURST_GRACE);
            expect(await countSentCommand(page, TAP_COMMAND)).toBe(1);
            expect(await countSentCommand(page, HOLD_COMMAND)).toBe(0);
        });

        test('a long press sends only the hold command', async ({ page }) => {
            const { x, y } = await buttonCenter(page);
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
            await page.waitForTimeout(800);
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

            await expect.poll(
                async () => await countSentCommand(page, HOLD_COMMAND),
                { message: 'hold macro should have run', timeout: 5000 },
            ).toBe(1);

            await page.waitForTimeout(MOUSE_BURST_GRACE);
            expect(await countSentCommand(page, HOLD_COMMAND)).toBe(1);
            expect(await countSentCommand(page, TAP_COMMAND)).toBe(0);
        });
    });

    test.describe('mouse interaction', () => {
        test.beforeEach(async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 900 });
            await prepare(page);
        });

        test('a click sends the regular command exactly once', async ({ page }) => {
            const { btn } = await buttonCenter(page);
            await btn.click();

            await expect.poll(
                async () => await countSentCommand(page, TAP_COMMAND),
                { message: 'tap macro should have run', timeout: 5000 },
            ).toBe(1);

            await page.waitForTimeout(MOUSE_BURST_GRACE);
            expect(await countSentCommand(page, TAP_COMMAND)).toBe(1);
            expect(await countSentCommand(page, HOLD_COMMAND)).toBe(0);
        });

        test('holding the mouse button sends only the hold command', async ({ page }) => {
            const { x, y } = await buttonCenter(page);
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.waitForTimeout(800);
            await page.mouse.up();

            await expect.poll(
                async () => await countSentCommand(page, HOLD_COMMAND),
                { message: 'hold macro should have run', timeout: 5000 },
            ).toBe(1);
            expect(await countSentCommand(page, TAP_COMMAND)).toBe(0);
        });
    });
});
