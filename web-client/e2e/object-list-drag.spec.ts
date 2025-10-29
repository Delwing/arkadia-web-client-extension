import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForClientReady} from './support/mocks';

test('object list drag persists after reload', async ({page}) => {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);

    const container = page.locator('#objects-list');
    await expect(container, 'should render object list container').toBeVisible();

    const initialBox = await container.boundingBox();
    expect(initialBox, 'should provide bounding box for object list').not.toBeNull();
    if (!initialBox) {
        return;
    }

    const dragOffsetX = 160;
    const dragOffsetY = 120;

    const startX = initialBox.x + initialBox.width / 2;
    const startY = initialBox.y + initialBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dragOffsetX, startY + dragOffsetY, {steps: 15});
    await page.mouse.up();

    const movedBox = await container.boundingBox();
    expect(movedBox, 'should provide bounding box after dragging').not.toBeNull();
    if (!movedBox) {
        return;
    }

    expect(movedBox.x, 'should move to the right after dragging').toBeGreaterThan(initialBox.x + dragOffsetX * 0.6);
    expect(movedBox.y, 'should move downward after dragging').toBeGreaterThan(initialBox.y + dragOffsetY * 0.6);

    const storedPositionHandle = await page.waitForFunction(() => {
        const raw = localStorage.getItem('objectsListPosition');
        if (!raw) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(raw);
            if (
                parsed &&
                typeof parsed.left === 'number' &&
                typeof parsed.top === 'number'
            ) {
                return parsed;
            }
        } catch (_error) {
            return undefined;
        }
        return undefined;
    });

    const storedPosition = await storedPositionHandle.jsonValue() as {left: number; top: number};
    expect(Math.abs(storedPosition.left - movedBox.x), 'should store horizontal position after drag').toBeLessThan(2);
    expect(Math.abs(storedPosition.top - movedBox.y), 'should store vertical position after drag').toBeLessThan(2);

    await page.reload();
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await expect(container).toBeVisible();

    await page.waitForFunction(([expectedLeft, expectedTop]) => {
        const element = document.getElementById('objects-list');
        if (!element) {
            return false;
        }
        const rect = element.getBoundingClientRect();
        return (
            Math.abs(rect.left - expectedLeft) < 2 &&
            Math.abs(rect.top - expectedTop) < 2
        );
    }, [storedPosition.left, storedPosition.top]);

    const reloadedBox = await container.boundingBox();
    expect(reloadedBox, 'should provide bounding box after reload').not.toBeNull();
    if (!reloadedBox) {
        return;
    }

    expect(Math.abs(reloadedBox.x - storedPosition.left), 'should restore horizontal position from storage').toBeLessThan(2);
    expect(Math.abs(reloadedBox.y - storedPosition.top), 'should restore vertical position from storage').toBeLessThan(2);
});
