import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    waitForCommandInput,
    waitForLayoutSaved,
    waitForMapReady,
} from './support/mocks';
import type { Page } from '@playwright/test';

const STATIC_MAP = '.static-map-popup';
const FLOATING_MAP = `.floating-panel--popup${STATIC_MAP}`;
const DOCKED_MAP = `.docked-panel--popup${STATIC_MAP}`;

async function boot(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await waitForMapReady(page);
}

async function openUiSettingsModal(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const el = document.getElementById('ui-settings-modal');
        return !el || window.getComputedStyle(el).display === 'none';
    });
    await page.click('#menu-button');
    await page.waitForSelector('#menu-button + .dropdown-menu.show', { timeout: 5000 });
    await page.click('#ui-settings-button');
    await page.waitForSelector('#ui-settings-modal.show', { timeout: 5000 });
    await page.waitForFunction(() => {
        const d = document.querySelector('#ui-settings-modal .modal-dialog') as HTMLElement | null;
        if (!d) return false;
        const t = window.getComputedStyle(d).transform;
        return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
    });
}

async function enableLayoutManager(page: Page): Promise<void> {
    await openUiSettingsModal(page);
    const toggle = page.locator('#ui-layout-manager-enabled');
    if (!(await toggle.isChecked())) await toggle.click();
    await page.click('#ui-settings-save');
    await page.waitForSelector('#ui-settings-modal.show', { state: 'hidden', timeout: 5000 });
    await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
}

async function openStaticMap(page: Page, roomId = 2): Promise<void> {
    await page.evaluate((id) => {
        const mapEl = document.getElementById('map');
        mapEl!.dispatchEvent(
            new CustomEvent('roomcontextmenu', {
                bubbles: true,
                cancelable: true,
                detail: { roomId: id, position: { x: 50, y: 50 } },
            })
        );
    }, roomId);
    await page.locator('#context-menu').getByText('Otworz okno mapy').click();
    await expect(page.locator(FLOATING_MAP)).toBeVisible({ timeout: 5000 });
}

/** Drag the floating static map titlebar into the right dock, below the map panel. */
async function dockStaticMap(page: Page): Promise<void> {
    const title = page.locator(`${FLOATING_MAP} .floating-panel__header`);
    // Aim at the bottom edge band of the docked map leaf -> a vertical split,
    // which lands the popup as its own DockedPanel rather than a tab stack.
    const leaf = (await page.locator('.dock-area-right [data-leaf-id="leaf-map-default"]').boundingBox())!;
    const dropX = leaf.x + leaf.width / 2;
    const dropY = leaf.y + leaf.height * 0.95;
    // hover() waits for the titlebar to stop moving; grabbing a stale box and
    // pressing beside the popup would trip the outside-click close instead.
    await title.hover();
    await page.mouse.down();
    await page.mouse.move(dropX, dropY, { steps: 15 });
    await page.mouse.move(dropX, dropY - 2, { steps: 3 });
    // Let the drop-preview state settle before releasing.
    await page.waitForTimeout(100);
    await page.mouse.up();
    await expect(page.locator(FLOATING_MAP)).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator(DOCKED_MAP)).toBeVisible({ timeout: 5000 });
}

/** Drag the docked static map titlebar back out into the log area. */
async function undockStaticMap(page: Page): Promise<void> {
    const title = page.locator(`${DOCKED_MAP} .docked-panel__header`);
    await title.hover();
    const from = (await title.boundingBox())!;
    await page.mouse.down();
    // Shift forces a float — no dock zone is accepted while it is held.
    await page.keyboard.down('Shift');
    await page.mouse.move(from.x + from.width / 2 - 400, from.y + 150, { steps: 12 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await expect(page.locator(FLOATING_MAP)).toBeVisible({ timeout: 5000 });
}

async function closeStaticMap(page: Page, docked = false): Promise<void> {
    const root = docked ? DOCKED_MAP : FLOATING_MAP;
    await page.locator(`${root} .panel-button--close`).click();
    await expect(page.locator(STATIC_MAP)).toHaveCount(0);
}

async function reload(page: Page): Promise<void> {
    // Let the debounced layout save flush before navigating away.
    await waitForLayoutSaved(page);
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await waitForMapReady(page);
}

test.describe('Static map window close/restore', () => {
    test.beforeEach(async ({ page }) => {
        await boot(page);
        await enableLayoutManager(page);
    });

    test('floating -> close -> reload stays closed', async ({ page }) => {
        await openStaticMap(page);
        await closeStaticMap(page);
        await reload(page);
        await expect(page.locator(STATIC_MAP)).toHaveCount(0);
    });

    test('floating -> dock -> close -> reload stays closed', async ({ page }) => {
        await openStaticMap(page);
        await dockStaticMap(page);
        await closeStaticMap(page, true);
        await reload(page);
        await expect(page.locator(STATIC_MAP)).toHaveCount(0);
    });

    test('floating -> dock -> undock -> close -> reload stays closed', async ({ page }) => {
        await openStaticMap(page);
        await dockStaticMap(page);
        await undockStaticMap(page);
        await closeStaticMap(page);
        await reload(page);
        await expect(page.locator(STATIC_MAP)).toHaveCount(0);
    });

    test('floating -> pin -> close -> reload stays closed', async ({ page }) => {
        await openStaticMap(page);
        await page.locator(FLOATING_MAP + ' .panel-button--pin').click();
        await closeStaticMap(page);
        await reload(page);
        await expect(page.locator(STATIC_MAP)).toHaveCount(0);
    });

    test('docked and left open -> reload restores it docked', async ({ page }) => {
        await openStaticMap(page);
        await dockStaticMap(page);
        await reload(page);
        await expect(page.locator(DOCKED_MAP)).toBeVisible({ timeout: 5000 });
    });
});
