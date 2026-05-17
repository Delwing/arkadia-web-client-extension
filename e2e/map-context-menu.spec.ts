import { expect, test } from './support/fixtures';
import {
    GMCP_PATHS,
    ensureGameSocket,
    getCommandLog,
    pushGmcp,
    resetCommandLog,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

const CONTEXT_MENU_SELECTOR = '#context-menu';
const LOCATION_TEXT_SELECTOR = '#location-text';
const POSLAN_MAP_NAME = 'Miasteczko Poslan';

async function dispatchRoomContextMenu(page: import('@playwright/test').Page, roomId: number): Promise<void> {
    await page.evaluate((id) => {
        const mapEl = document.getElementById('map');
        const event = new CustomEvent('roomcontextmenu', {
            bubbles: true,
            cancelable: true,
            detail: { roomId: id, position: { x: 50, y: 50 } },
        });
        mapEl!.dispatchEvent(event);
    }, roomId);
}

test.describe('Map context menu', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);
    });

    test('menu appears with correct header when right-clicking a room', async ({ page }) => {
        await dispatchRoomContextMenu(page, 2);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);
        await expect(menu).toContainText('Lokacja: 2');
    });

    test('menu header uses small header style', async ({ page }) => {
        await dispatchRoomContextMenu(page, 2);

        const header = page.locator(`${CONTEXT_MENU_SELECTOR} .context-menu-header-small`);
        await expect(header).toBeVisible();
        await expect(header).toHaveText('Lokacja: 2');
    });

    test('menu contains all expected items', async ({ page }) => {
        await dispatchRoomContextMenu(page, 2);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        await expect(menu).toContainText('Ustaw lokację');
        await expect(menu).toContainText('Prowadź do lokacji');
        await expect(menu).toContainText('Idź do lokacji');
        await expect(menu).toContainText('Dodaj skrót');
        await expect(menu).toContainText('Dodaj przystanek');
        await expect(menu).toContainText('Notatka');
        await expect(menu).toContainText('Informacje o lokacji');
        await expect(menu).toContainText('Otworz okno mapy');
    });

    test('window-opening items have the opens-window class', async ({ page }) => {
        await dispatchRoomContextMenu(page, 2);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const opensWindowButtons = menu.locator('button.opens-window');
        await expect(opensWindowButtons).toHaveCount(5);
    });

    test('"Ustaw lokację" updates the location label to target room', async ({ page }) => {
        // Move player to room 2 so room 3 is a distinct target
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 2,
            id: 2,
            name: 'Rynek',
            zone: POSLAN_MAP_NAME,
            exits: { west: 1, east: 3 },
            map: { x: 1, y: 0, name: POSLAN_MAP_NAME },
        });

        const locationLabel = page.locator(LOCATION_TEXT_SELECTOR);
        await expect(locationLabel).toContainText('#2');

        await dispatchRoomContextMenu(page, 3);
        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const setLocationButton = menu.locator('button', { hasText: 'Ustaw lokację' });
        await setLocationButton.click();

        await expect(locationLabel).toContainText('#3');
    });

    test('"Prowadź do lokacji" shows path arrow pointing to target room', async ({ page }) => {
        // Player starts at room 1; lead to room 3
        await dispatchRoomContextMenu(page, 3);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const leadButton = menu.locator('button', { hasText: 'Prowadź do lokacji' });
        await leadButton.click();

        const locationLabel = page.locator(LOCATION_TEXT_SELECTOR);
        await expect(locationLabel).toContainText('→ #3');
    });

    test('"Idź do lokacji" triggers auto-walk and shows path arrow', async ({ page }) => {
        await resetCommandLog(page);

        // Player starts at room 1; walk to room 3
        await dispatchRoomContextMenu(page, 3);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const walkButton = menu.locator('button', { hasText: 'Idź do lokacji' });
        await walkButton.click();

        // /idz calls leadTo internally, which sets the path destination
        const locationLabel = page.locator(LOCATION_TEXT_SELECTOR);
        await expect(locationLabel).toContainText('→ #3');
    });

    test('clicking any button hides the menu', async ({ page }) => {
        await dispatchRoomContextMenu(page, 2);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        // Click the first non-window-opening button (Ustaw lokację)
        const firstButton = menu.locator('button', { hasText: 'Ustaw lokację' });
        await firstButton.click();

        await expect(menu).not.toBeVisible();
    });

    test('clicking an opens-window button also hides the menu', async ({ page }) => {
        await dispatchRoomContextMenu(page, 2);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const shortcutButton = menu.locator('button', { hasText: 'Dodaj skrót' });
        await shortcutButton.click();

        await expect(menu).not.toBeVisible();
    });

    test('roomId 0 does not open the context menu', async ({ page }) => {
        await dispatchRoomContextMenu(page, 0);

        // Short wait — menu should not appear (negative assertion)
        await page.waitForTimeout(200);

        const hasShow = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el?.classList.contains('show') ?? false;
        }, CONTEXT_MENU_SELECTOR);

        expect(hasShow).toBe(false);
    });

    test('dispatching context menu for a different room shows correct room number in header', async ({ page }) => {
        await dispatchRoomContextMenu(page, 4);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);
        await expect(menu).toContainText('Lokacja: 4');
        await expect(menu).not.toContainText('Lokacja: 1');
        await expect(menu).not.toContainText('Lokacja: 2');
    });

    test('"Prowadź do lokacji" for room 4 shows path arrow to room 4', async ({ page }) => {
        // Room 4 requires going north from room 3 which requires going east from room 1
        await dispatchRoomContextMenu(page, 4);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const leadButton = menu.locator('button', { hasText: 'Prowadź do lokacji' });
        await leadButton.click();

        const locationLabel = page.locator(LOCATION_TEXT_SELECTOR);
        await expect(locationLabel).toContainText('→ #4');
    });

    test('"Idź do lokacji" sends direction command over WebSocket after walk delay', async ({ page }) => {
        await page.clock.install();
        await resetCommandLog(page);

        await dispatchRoomContextMenu(page, 3);

        const menu = page.locator(CONTEXT_MENU_SELECTOR);
        await expect(menu).toHaveClass(/show/);

        const walkButton = menu.locator('button', { hasText: 'Idź do lokacji' });
        await walkButton.click();

        // Advance fake clock past the walk delay (1s base + up to 0.3s jitter)
        await page.clock.fastForward(1500);

        const commandLog = await getCommandLog(page);
        // /idz calls leadTo (path arrow visible) and then sends direction commands after delay
        expect(commandLog.length).toBeGreaterThan(0);
    });
});
