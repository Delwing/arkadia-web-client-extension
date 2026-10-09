import { expect, test } from './support/fixtures';
import { waitForCommandInput } from './support/mocks';

const button = (id: string, x: number, y: number) => ({
    id,
    label: id,
    macroType: 'command',
    command: '',
    color: '#0d6efd',
    fontColor: '#f1f5f9',
    fontSize: 11,
    width: 80,
    height: 36,
    x,
    y,
    backgroundOpacity: 0.85,
});

const settings = (snap: boolean) => ({
    buttons: [button('anchor', 200, 200), button('moving', 400, 400)],
    locked: false,
    snap,
});

test.describe('Desktop button drag snapping', () => {
    const prepare = async (page: import('@playwright/test').Page, snap: boolean) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.addInitScript((s) => {
            localStorage.setItem('desktopButtonSettings', JSON.stringify(s));
        }, settings(snap));
        await page.goto('/');
        await waitForCommandInput(page);
    };

    /** Long-press the moving button, then drag its top-left corner to (x, y) and drop it. */
    const dragTo = async (page: import('@playwright/test').Page, x: number, y: number, opts: { alt?: boolean } = {}) => {
        const btn = page.locator('#moving');
        const box = (await btn.boundingBox())!;
        await page.mouse.move(box.x + 10, box.y + 10);
        await page.mouse.down();
        await page.waitForTimeout(1100);
        if (opts.alt) await page.keyboard.down('Alt');
        await page.mouse.move(x + 10, y + 10, { steps: 5 });
        await page.waitForTimeout(100);
        const guidesWhileDragging = await page.locator('.desktop-button-guide').count();
        await page.mouse.up();
        if (opts.alt) await page.keyboard.up('Alt');
        // A stray move right after the drop must neither move the button nor bring the guides back.
        await page.mouse.move(x + 30, y + 30);
        return guidesWhileDragging;
    };

    const position = async (page: import('@playwright/test').Page) =>
        page.locator('#moving').evaluate((el) => [parseInt((el as HTMLElement).style.left, 10), parseInt((el as HTMLElement).style.top, 10)]);

    test('snaps a gap away from a neighbour and clears the guides on drop', async ({ page }) => {
        await prepare(page, true);
        // Right of the anchor, nearly touching and a few px lower.
        const guides = await dragTo(page, 281, 203);
        expect(guides).toBeGreaterThan(0);
        expect(await position(page)).toEqual([284, 200]);
        await expect(page.locator('.desktop-button-guide')).toHaveCount(0);

        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('desktopButtonSettings')!));
        expect(saved.buttons.find((b: { id: string }) => b.id === 'moving')).toMatchObject({ x: 284, y: 200 });
    });

    test('Alt places freely when snapping is on', async ({ page }) => {
        await prepare(page, true);
        const guides = await dragTo(page, 281, 203, { alt: true });
        expect(guides).toBe(0);
        expect(await position(page)).toEqual([281, 203]);
    });

    test('Alt snaps when snapping is off', async ({ page }) => {
        await prepare(page, false);
        expect(await dragTo(page, 281, 203)).toBe(0);
        expect(await position(page)).toEqual([281, 203]);

        await dragTo(page, 281, 203, { alt: true });
        expect(await position(page)).toEqual([284, 200]);
    });
});
