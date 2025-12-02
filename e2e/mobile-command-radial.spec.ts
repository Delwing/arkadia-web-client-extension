import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getLastOutgoingCommand, waitForCommandInput} from './support/mocks';

const LONG_PRESS_DELAY = 500;
const MENU_RADIUS = 112;

async function dispatchTouchEvent(
    page: Page,
    target: string,
    type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
    x: number,
    y: number,
    identifier: number,
) {
    await page.evaluate((params: {
        targetSelector: string;
        eventType: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';
        clientX: number;
        clientY: number;
        pointerIdentifier: number;
    }) => {
        const {
            targetSelector,
            eventType,
            clientX,
            clientY,
            pointerIdentifier,
        } = params;

        const targetNode = targetSelector === 'document'
            ? document
            : document.querySelector<HTMLElement>(targetSelector);

        if (!targetNode) {
            throw new Error(`Could not find touch event target: ${targetSelector}`);
        }

        const eventTarget = targetNode instanceof Document
            ? targetNode.documentElement ?? targetNode.body
            : targetNode;

        if (!eventTarget) {
            throw new Error(`Could not resolve event target for: ${targetSelector}`);
        }

        const touchInit: TouchInit = {
            identifier: pointerIdentifier,
            target: eventTarget,
            clientX,
            clientY,
            screenX: clientX,
            screenY: clientY,
            pageX: clientX,
            pageY: clientY,
            radiusX: 1,
            radiusY: 1,
            rotationAngle: 0,
            force: 1,
        };

        const createTouch = (): Touch => {
            if (typeof Touch === 'function') {
                return new Touch(touchInit);
            }

            const fallback = {
                identifier: touchInit.identifier,
                target: touchInit.target,
                clientX: touchInit.clientX,
                clientY: touchInit.clientY,
                screenX: touchInit.screenX,
                screenY: touchInit.screenY,
                pageX: touchInit.pageX,
                pageY: touchInit.pageY,
                radiusX: touchInit.radiusX ?? 1,
                radiusY: touchInit.radiusY ?? 1,
                rotationAngle: touchInit.rotationAngle ?? 0,
                force: touchInit.force ?? 1,
            };

            return fallback as unknown as Touch;
        };

        const activeTouch = createTouch();
        const touches = eventType === 'touchend' || eventType === 'touchcancel' ? [] : [activeTouch];
        const changedTouch = createTouch();
        const changedTouches = [changedTouch];

        let event: TouchEvent;
        if (typeof TouchEvent === 'function') {
            event = new TouchEvent(eventType, {
                bubbles: true,
                cancelable: true,
                composed: true,
                touches,
                targetTouches: touches,
                changedTouches,
            });
        } else {
            event = new Event(eventType, {
                bubbles: true,
                cancelable: true,
                composed: true,
            }) as TouchEvent;

            Object.defineProperties(event, {
                touches: {value: touches, configurable: true},
                targetTouches: {value: touches, configurable: true},
                changedTouches: {value: changedTouches, configurable: true},
            });
        }

        eventTarget.dispatchEvent(event);
    }, {
        targetSelector: target,
        eventType: type,
        clientX: x,
        clientY: y,
        pointerIdentifier: identifier,
    });
}

test.describe('Mobile command radial', () => {
    test.use({hasTouch: true});

    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 500, height: 900});
        await page.addInitScript(() => {
            Object.defineProperty(window, 'ontouchstart', {
                value: () => {},
                configurable: true,
            });
            Object.defineProperty(window.navigator, 'maxTouchPoints', {
                value: 5,
                configurable: true,
            });
        });
    });

    test('radial menu opens on long press and shows commands', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const contentArea = page.locator('#main_text_output_msg_wrapper');
        await expect(contentArea, 'should display content area').toBeVisible();

        const radialOverlay = page.locator('#mobile-command-radial');
        await expect(radialOverlay, 'radial menu should be hidden initially').not.toHaveClass(/mobile-command-radial--visible/);

        const box = await contentArea.boundingBox();
        expect(box, 'should have bounding box for content area').not.toBeNull();
        if (!box) return;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const touchId = 1;

        // Start touch
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchstart', centerX, centerY, touchId);

        // Wait for long press delay
        await page.waitForTimeout(LONG_PRESS_DELAY + 50);

        // Radial menu should now be visible
        await expect(radialOverlay, 'radial menu should be visible after long press').toHaveClass(/mobile-command-radial--visible/);

        // Commands should be rendered (default commands exist)
        const commands = radialOverlay.locator('.mobile-command-radial__command');
        const commandCount = await commands.count();
        expect(commandCount, 'should show command buttons').toBeGreaterThan(0);

        // End touch to close
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchend', centerX, centerY, touchId);

        // Menu should close
        await expect(radialOverlay, 'radial menu should close after touch end').not.toHaveClass(/mobile-command-radial--visible/);
    });

    test('selects and executes command on touch move and release', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const contentArea = page.locator('#main_text_output_msg_wrapper');
        const radialOverlay = page.locator('#mobile-command-radial');

        const box = await contentArea.boundingBox();
        expect(box, 'should have bounding box for content area').not.toBeNull();
        if (!box) return;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const touchId = 1;

        // Start touch and wait for menu to appear
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchstart', centerX, centerY, touchId);
        await page.waitForTimeout(LONG_PRESS_DELAY + 50);

        await expect(radialOverlay, 'radial menu should be visible').toHaveClass(/mobile-command-radial--visible/);

        // Move touch to first command position (top of the radial - angle -90 degrees)
        const targetX = centerX;
        const targetY = centerY - MENU_RADIUS;

        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchmove', targetX, targetY, touchId);

        // Command should be highlighted
        const highlightedCommand = radialOverlay.locator('.mobile-command-radial__command--highlighted');
        await expect(highlightedCommand, 'should highlight a command').toHaveCount(1);

        // End touch to execute command
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchend', targetX, targetY, touchId);

        // Menu should close
        await expect(radialOverlay, 'radial menu should close after selection').not.toHaveClass(/mobile-command-radial--visible/);

        // Verify a command was sent (we don't know which one will be at the top)
        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'should send a command').not.toBeNull();
    });

    test('menu closes without executing when releasing inside threshold', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const contentArea = page.locator('#main_text_output_msg_wrapper');
        const radialOverlay = page.locator('#mobile-command-radial');

        const box = await contentArea.boundingBox();
        expect(box, 'should have bounding box for content area').not.toBeNull();
        if (!box) return;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const touchId = 1;

        // Start touch and wait for menu to appear
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchstart', centerX, centerY, touchId);
        await page.waitForTimeout(LONG_PRESS_DELAY + 50);

        await expect(radialOverlay, 'radial menu should be visible').toHaveClass(/mobile-command-radial--visible/);

        // Move within threshold (less than activation radius)
        const smallMoveX = centerX + 20;
        const smallMoveY = centerY + 20;
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchmove', smallMoveX, smallMoveY, touchId);

        // No command should be highlighted when inside threshold
        const highlightedCommand = radialOverlay.locator('.mobile-command-radial__command--highlighted');
        await expect(highlightedCommand, 'should not highlight any command inside threshold').toHaveCount(0);

        // End touch inside threshold
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchend', smallMoveX, smallMoveY, touchId);

        // Menu should close
        await expect(radialOverlay, 'radial menu should close').not.toHaveClass(/mobile-command-radial--visible/);

        // No command should have been sent
        const lastCommand = await getLastOutgoingCommand(page);
        expect(lastCommand, 'should not send any command when cancelled').toBeNull();
    });

    test('radial menu closes on touch cancel', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const contentArea = page.locator('#main_text_output_msg_wrapper');
        const radialOverlay = page.locator('#mobile-command-radial');

        const box = await contentArea.boundingBox();
        expect(box, 'should have bounding box for content area').not.toBeNull();
        if (!box) return;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const touchId = 1;

        // Open the radial menu via touch
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchstart', centerX, centerY, touchId);
        await page.waitForTimeout(LONG_PRESS_DELAY + 50);
        await expect(radialOverlay, 'radial menu should be visible').toHaveClass(/mobile-command-radial--visible/);

        // Cancel touch
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchcancel', centerX, centerY, touchId);

        // Menu should close
        await expect(radialOverlay, 'radial menu should close on touch cancel').not.toHaveClass(/mobile-command-radial--visible/);
    });

    test('does not open on short tap', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const contentArea = page.locator('#main_text_output_msg_wrapper');
        const radialOverlay = page.locator('#mobile-command-radial');

        const box = await contentArea.boundingBox();
        expect(box, 'should have bounding box for content area').not.toBeNull();
        if (!box) return;

        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const touchId = 1;

        // Short tap - start and end quickly
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchstart', centerX, centerY, touchId);
        await page.waitForTimeout(100); // Much shorter than LONG_PRESS_DELAY
        await dispatchTouchEvent(page, '#main_text_output_msg_wrapper', 'touchend', centerX, centerY, touchId);

        // Radial should not have opened
        await expect(radialOverlay, 'radial menu should remain hidden on short tap').not.toHaveClass(/mobile-command-radial--visible/);
    });
});
