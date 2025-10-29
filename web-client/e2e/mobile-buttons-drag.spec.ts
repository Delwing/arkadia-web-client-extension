import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForClientReady} from './support/mocks';

type Orientation = 'portrait' | 'landscape';
type StoredPosition = {x: number; y: number; origin: 'left' | 'right'};

test.describe('Mobile direction buttons drag', () => {
    test.use({hasTouch: true});

    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 500, height: 900});
        await page.addInitScript(() => {
            window.localStorage.removeItem('mobileButtonsPosition');
        });
    });

    test('dragging updates position and persists across reload', async ({page}) => {
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

        await page.touchscreen.down(startX, startY);

        try {
            await page.waitForFunction(() => (
                document.getElementById('mobile-direction-buttons')?.classList.contains('dragging') ?? false
            ));

            const steps = 12;
            for (let index = 1; index <= steps; index += 1) {
                const progress = index / steps;
                const intermediateX = startX + (targetX - startX) * progress;
                const intermediateY = startY + (targetY - startY) * progress;
                await page.touchscreen.move(intermediateX, intermediateY);
                await page.waitForTimeout(16);
            }
        } finally {
            await page.touchscreen.up();
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
    });
});
