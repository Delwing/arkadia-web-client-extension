import type {Page} from '@playwright/test';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForClientReady} from './support/mocks';

type Orientation = 'portrait' | 'landscape';
type StoredPosition = {x: number; y: number; origin: 'left' | 'right'};
type InputMethod = 'touch' | 'mouse';

async function dispatchPointerEvent(
    page: Page,
    target: string,
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    x: number,
    y: number,
    pointerType: Extract<InputMethod, 'touch'>,
    pointerId: number
) {
    await page.evaluate(([
        targetSelector,
        eventType,
        clientX,
        clientY,
        pointerTypeName,
        pointerIdentifier,
    ]) => {
        const targetNode = targetSelector === 'document'
            ? document
            : document.querySelector<HTMLElement>(targetSelector);

        if (!targetNode) {
            throw new Error(`Could not find pointer event target: ${targetSelector}`);
        }

        const pointerEvent = new PointerEvent(eventType, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            pageX: clientX,
            pageY: clientY,
            screenX: clientX,
            screenY: clientY,
            pointerId: pointerIdentifier,
            pointerType: pointerTypeName,
            isPrimary: true,
            buttons: 1,
            pressure: pointerTypeName === 'touch' ? 1 : 0.5,
        });

        targetNode.dispatchEvent(pointerEvent);
    }, [target, type, x, y, pointerType, pointerId]);
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
            await dispatchPointerEvent(
                page,
                '#mobile-direction-buttons',
                'pointerdown',
                startX,
                startY,
                'touch',
                pointerId,
            );
            return;
        }

        await page.mouse.move(startX, startY);
        await page.mouse.down();
    };

    const pointerMove = async (x: number, y: number) => {
        if (method === 'touch') {
            await dispatchPointerEvent(
                page,
                'document',
                'pointermove',
                x,
                y,
                'touch',
                pointerId,
            );
            return;
        }

        await page.mouse.move(x, y);
    };

    const pointerUp = async (x: number, y: number) => {
        if (method === 'touch') {
            await dispatchPointerEvent(
                page,
                'document',
                'pointerup',
                x,
                y,
                'touch',
                pointerId,
            );
            return;
        }

        await page.mouse.up();
    };

    await pointerDown();

    try {
        const steps = 12;
        for (let index = 1; index <= steps; index += 1) {
            const progress = index / steps;
            const intermediateX = startX + (targetX - startX) * progress;
            const intermediateY = startY + (targetY - startY) * progress;
            await pointerMove(intermediateX, intermediateY);

            if (index === 1) {
                await page.waitForFunction(() => (
                    document.getElementById('mobile-direction-buttons')?.classList.contains('dragging') ?? false
                ));
            }

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
