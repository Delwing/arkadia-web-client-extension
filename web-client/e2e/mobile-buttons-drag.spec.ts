import type {Page} from '@playwright/test';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForClientReady} from './support/mocks';

type Orientation = 'portrait' | 'landscape';
type StoredPosition = {x: number; y: number; origin: 'left' | 'right'};
type InputMethod = 'touch' | 'mouse';

async function dispatchTouchEvent(
    page: Page,
    target: string,
    type: 'touchstart' | 'touchmove' | 'touchend',
    x: number,
    y: number,
    identifier: number,
) {
    await page.evaluate(([
        targetSelector,
        eventType,
        clientX,
        clientY,
        pointerIdentifier,
    ]) => {
        const targetNode = targetSelector === 'document'
            ? document
            : document.querySelector<HTMLElement>(targetSelector);

        if (!targetNode) {
            throw new Error(`Could not find touch event target: ${targetSelector}`);
        }

        const eventTarget = targetNode instanceof Document ? targetNode.documentElement : targetNode;
        if (!eventTarget) {
            throw new Error(`Could not resolve event target for: ${targetSelector}`);
        }

        const createTouch = () => {
            const init = {
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

            if (typeof Touch === 'function') {
                return new Touch(init);
            }

            return init as unknown as Touch;
        };

        const activeTouch = createTouch();
        const touches = eventType === 'touchend' ? [] : [activeTouch];
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

        targetNode.dispatchEvent(event);
    }, [target, type, x, y, identifier]);
}

async function dragAndAssertPersistence(page: Page, method: InputMethod) {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);

    const container = page.locator('#mobile-direction-buttons');
    await expect(container, 'should display mobile direction buttons').toBeVisible();

    const initialPosition = await container.evaluate(() => {
        const rect = (document.getElementById('mobile-direction-buttons') as HTMLDivElement).getBoundingClientRect();
        return {left: Math.round(rect.left), top: Math.round(rect.top)};
    });

    const box = await container.boundingBox();
    expect(box, 'should provide bounding box for direction buttons').not.toBeNull();
    if (!box) {
        return;
    }

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const targetX = startX + 120;
    const targetY = startY + 90;

    const pointerId = 1;

    const pointerDown = async () => {
        if (method === 'touch') {
            await dispatchTouchEvent(page, '#mobile-direction-buttons', 'touchstart', startX, startY, pointerId);
            return;
        }

        await page.mouse.move(startX, startY);
        await page.mouse.down();
    };

    const pointerMove = async (x: number, y: number) => {
        if (method === 'touch') {
            await dispatchTouchEvent(page, '#mobile-direction-buttons', 'touchmove', x, y, pointerId);
            return;
        }

        await page.mouse.move(x, y);
    };

    const pointerUp = async (x: number, y: number) => {
        if (method === 'touch') {
            await dispatchTouchEvent(page, '#mobile-direction-buttons', 'touchend', x, y, pointerId);
            return;
        }

        await page.mouse.up();
    };

    await pointerDown();

    try {
        await page.waitForFunction(() => (
            document.getElementById('mobile-direction-buttons')?.classList.contains('dragging') ?? false
        ));

        const steps = 12;
        for (let index = 1; index <= steps; index += 1) {
            const progress = index / steps;
            const intermediateX = startX + (targetX - startX) * progress;
            const intermediateY = startY + (targetY - startY) * progress;
            await pointerMove(intermediateX, intermediateY);
            await page.waitForTimeout(16);
        }
    } finally {
        await pointerUp(targetX, targetY);
    }

    await page.waitForFunction(([initialLeft, initialTop]) => {
        const element = document.getElementById('mobile-direction-buttons');
        if (!element) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        const left = Math.round(rect.left);
        const top = Math.round(rect.top);
        return left !== initialLeft || top !== initialTop;
    }, [initialPosition.left, initialPosition.top]);

    const finalPosition = await container.evaluate(() => {
        const rect = (document.getElementById('mobile-direction-buttons') as HTMLDivElement).getBoundingClientRect();
        return {left: Math.round(rect.left), top: Math.round(rect.top)};
    });

    const orientation = await page.evaluate<Orientation>(() => (
        window.innerHeight >= window.innerWidth ? 'portrait' : 'landscape'
    ));

    const storedPositions = await page.evaluate(() => {
        const raw = window.localStorage.getItem('mobileButtonsPosition');
        return raw ? JSON.parse(raw) : null;
    }) as Partial<Record<Orientation, StoredPosition>> | StoredPosition | null;

    const storedPosition: StoredPosition | null = storedPositions && 'x' in (storedPositions as StoredPosition)
        ? storedPositions as StoredPosition
        : (storedPositions as Partial<Record<Orientation, StoredPosition>> | null)?.[orientation] ?? null;

    expect(storedPosition, 'should store dragged position in localStorage').not.toBeNull();
    if (!storedPosition) {
        return;
    }

    expect(storedPosition.origin, 'should use left origin for stored position').toBe('left');
    expect(finalPosition.left, 'should update horizontal position after drag').not.toBe(initialPosition.left);
    expect(finalPosition.top, 'should update vertical position after drag').not.toBe(initialPosition.top);
    expect(storedPosition.x, 'should persist horizontal position from bounding rect').toBe(finalPosition.left);
    expect(storedPosition.y, 'should persist vertical position from bounding rect').toBe(finalPosition.top);

    await page.reload();
    await waitForClientReady(page);
    await ensureGameSocket(page);

    await page.waitForFunction(([expected]) => {
        const element = document.getElementById('mobile-direction-buttons');
        if (!element) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        const left = Math.round(rect.left);
        const top = Math.round(rect.top);
        return left === expected.x && top === expected.y;
    }, [storedPosition]);

    const reloadedPosition = await container.evaluate(() => {
        const rect = (document.getElementById('mobile-direction-buttons') as HTMLDivElement).getBoundingClientRect();
        return {left: Math.round(rect.left), top: Math.round(rect.top)};
    });

    expect(reloadedPosition.left, 'should restore stored horizontal position after reload').toBe(storedPosition.x);
    expect(reloadedPosition.top, 'should restore stored vertical position after reload').toBe(storedPosition.y);
}

test.describe('Mobile direction buttons drag', () => {
    const prepare = async ({page}: {page: Page}) => {
        await page.setViewportSize({width: 500, height: 900});
        await page.addInitScript(() => {
            window.localStorage.removeItem('mobileButtonsPosition');
        });
    };

    test.describe('touch interaction', () => {
        test.use({hasTouch: true});
        test.beforeEach(prepare);

        test('dragging updates position and persists across reload (touch)', async ({page}) => {
            await dragAndAssertPersistence(page, 'touch');
        });
    });

    test.describe('mouse interaction', () => {
        test.beforeEach(prepare);

        test('dragging updates position and persists across reload (mouse)', async ({page}) => {
            await dragAndAssertPersistence(page, 'mouse');
        });
    });
});
