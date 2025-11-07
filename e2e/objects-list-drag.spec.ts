import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';

test.describe('Objects list drag persistence', () => {
    test.beforeEach(async ({page}) => {
        await page.addInitScript(() => {
            const flag = '__objectsListDragTestInitialized';
            if (!window.sessionStorage.getItem(flag)) {
                window.localStorage.removeItem('objectsListPosition');
                window.sessionStorage.setItem(flag, 'true');
            }
        });
    });

    test('dragging stores position and restores it after reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const container = page.locator('#objects-list');
        await expect(container, 'objects list should be visible').toBeVisible();

        const initialPosition = await container.evaluate(() => {
            const element = document.getElementById('objects-list') as HTMLDivElement | null;
            if (!element) {
                throw new Error('Objects list element not found');
            }
            const rect = element.getBoundingClientRect();
            return {left: Math.round(rect.left), top: Math.round(rect.top)};
        });

        const pointerCoordinates = await page.evaluate(() => {
            const element = document.getElementById('objects-list') as HTMLDivElement | null;
            if (!element) {
                throw new Error('Objects list element not found');
            }
            const rect = element.getBoundingClientRect();
            const startX = rect.left + Math.max(1, rect.width / 2);
            const startY = rect.top + Math.max(1, rect.height / 2);
            const margin = 24;
            const targetX = Math.min(window.innerWidth - margin, startX + 160);
            const targetY = Math.min(window.innerHeight - margin, startY + 120);
            return {startX, startY, targetX, targetY};
        });

        await page.mouse.move(pointerCoordinates.startX, pointerCoordinates.startY);
        await page.mouse.down();
        await page.mouse.move(pointerCoordinates.targetX, pointerCoordinates.targetY, {steps: 8});
        await page.mouse.up();

        await page.waitForFunction(([initialLeft, initialTop]) => {
            const element = document.getElementById('objects-list');
            if (!element) {
                return false;
            }
            const rect = element.getBoundingClientRect();
            const left = Math.round(rect.left);
            const top = Math.round(rect.top);
            return left !== initialLeft || top !== initialTop;
        }, [initialPosition.left, initialPosition.top]);

        const finalPosition = await container.evaluate(() => {
            const element = document.getElementById('objects-list') as HTMLDivElement | null;
            if (!element) {
                throw new Error('Objects list element not found');
            }
            const rect = element.getBoundingClientRect();
            return {left: rect.left, top: rect.top};
        });

        expect(Math.round(finalPosition.left)).not.toBe(initialPosition.left);
        expect(Math.round(finalPosition.top)).not.toBe(initialPosition.top);

        const storedPosition = await page.evaluate(() => {
            const raw = window.localStorage.getItem('objectsListPosition');
            return raw ? JSON.parse(raw) as {left?: number; top?: number; x?: number; y?: number} : null;
        });

        expect(storedPosition, 'should persist dragged position in storage').not.toBeNull();
        if (!storedPosition) {
            return;
        }

        const storedLeft = storedPosition.left ?? storedPosition.x;
        const storedTop = storedPosition.top ?? storedPosition.y;

        expect(typeof storedLeft, 'stored horizontal position should be numeric').toBe('number');
        expect(typeof storedTop, 'stored vertical position should be numeric').toBe('number');
        if (typeof storedLeft !== 'number' || typeof storedTop !== 'number') {
            return;
        }

        expect(Math.round(storedLeft)).toBe(Math.round(finalPosition.left));
        expect(Math.round(storedTop)).toBe(Math.round(finalPosition.top));

        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await page.waitForFunction(([expectedLeft, expectedTop]) => {
            const element = document.getElementById('objects-list');
            if (!element) {
                return false;
            }
            const rect = element.getBoundingClientRect();
            const left = Math.round(rect.left);
            const top = Math.round(rect.top);
            return left === Math.round(expectedLeft) && top === Math.round(expectedTop);
        }, [storedLeft, storedTop]);

        const reloadedPosition = await container.evaluate(() => {
            const element = document.getElementById('objects-list') as HTMLDivElement | null;
            if (!element) {
                throw new Error('Objects list element not found');
            }
            const rect = element.getBoundingClientRect();
            return {left: rect.left, top: rect.top};
        });

        expect(Math.round(reloadedPosition.left)).toBe(Math.round(storedLeft));
        expect(Math.round(reloadedPosition.top)).toBe(Math.round(storedTop));
    });
});
