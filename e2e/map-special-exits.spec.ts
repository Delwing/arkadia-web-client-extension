import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getCommandLog,
    GMCP_PATHS,
    mockMapDownloads,
    pushGmcp,
    submitCommand,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';
import mapData from './support/mock-data/map-data.json' with {type: 'json'};

/**
 * The map's special exits for the room you stand in: the ones the game does
 * not list ("wejdz na gore") join the compass, have a widget of their own, and
 * show in the map's exits bar with everything else.
 */

const MENU = '#context-menu';

async function enterRynek(page: Page): Promise<void> {
    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        map: {x: 1, y: 0, name: 'Miasteczko Poslan'},
        exits: ['wschod', 'zachod', 'brama'],
    });
    await expect(page.locator('#location-text')).toContainText('Rynek');
}

test.describe('Map special exits', () => {
    test.beforeEach(async ({context, page}) => {
        const data = structuredClone(mapData) as typeof mapData;
        const room = data.flatMap(a => a.rooms).find(r => r.id === 2)!;
        (room as {specialExits: Record<string, number>}).specialExits = {brama: 1, 'wejdz na gore': 4};
        await mockMapDownloads(context, {mapData: data as never});
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);
    });

    test('the footer compass adds the map exit the game does not list', async ({page}) => {
        await openSettings(page, 'ui-footer');
        await page.locator('#ui-footer-layout').selectOption('arkadia');
        await saveSettings(page);
        await enterRynek(page);

        const compass = page.locator('#char-state .footer-compass');
        await expect(compass.locator('.footer-compass__exit')).toHaveText(['brama', 'wejdz na gore']);
        await expect(compass.locator('.footer-compass__exit.is-custom')).toHaveText(['wejdz na gore']);

        await compass.locator('.footer-compass__exit.is-custom').click();
        await expect.poll(() => getCommandLog(page)).toContain('wejdz na gore');
    });

    test('the special exits widget lists only the hidden ones', async ({page}) => {
        await submitCommand(page, '/widzety');
        await page.locator('.widget-toolbar').getByRole('button', {name: 'Dodaj'}).click();
        await page.locator(MENU).getByText('Wyjścia specjalne', {exact: true}).click();
        await page.keyboard.press('Escape');
        await expect(page.locator('.widget-toolbar')).toBeHidden();

        await enterRynek(page);
        const widget = page.locator('.widget-frame[data-widget-type="specialExits"]');
        await expect(widget.locator('.widget-exits__exit')).toHaveText(['wejdz na gore']);
        await widget.locator('.widget-exits__exit').click();
        await expect.poll(() => getCommandLog(page)).toContain('wejdz na gore');
    });

    test('the compass widget keeps a column for special exits, or hides them by its setting', async ({page}) => {
        await submitCommand(page, '/widzety');
        await page.locator('.widget-toolbar').getByRole('button', {name: 'Dodaj'}).click();
        await page.locator(MENU).getByText('Kompas', {exact: true}).click();
        await page.keyboard.press('Escape');
        await expect(page.locator('.widget-toolbar')).toBeHidden();

        const widget = page.locator('.widget-frame[data-widget-type="compass"]');
        const column = widget.locator('.footer-compass__special');
        // Reserved before any room, so the rose does not shift when one has special exits.
        await expect(column).toHaveCount(1);
        const emptyWidth = (await column.boundingBox())!.width;
        expect(emptyWidth).toBeGreaterThan(50);

        await enterRynek(page);
        await expect(column.locator('.footer-compass__exit')).toHaveText(['brama', 'wejdz na gore']);
        expect((await column.boundingBox())!.width).toBeCloseTo(emptyWidth, 0);

        await widget.click({button: 'right'});
        await page.locator(MENU).getByText('Ukryj', {exact: true}).click();
        await expect(column).toHaveCount(0);
        await expect(widget.locator('[data-dir="e"]')).toBeEnabled();
    });

    test('the exits bar, turned on in the map settings, lists every exit', async ({page}) => {
        await openSettings(page, 'ui-windows');
        const layoutToggle = page.locator('#ui-layout-manager-enabled');
        if (!(await layoutToggle.isChecked())) await layoutToggle.click();
        await saveSettings(page);
        await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
        await enterRynek(page);

        const bar = page.locator('.map-exits-bar');
        await expect(bar).toHaveCount(0);

        await page.locator('.docked-panel--map .panel-button--settings').click();
        await page.locator('.window-settings .window-settings__toggle', {hasText: 'Pasek wyjść'}).click();
        await page.keyboard.press('Escape');

        await expect(bar.locator('.map-exits-bar__exit')).toHaveText(['e', 'w', 'brama', 'wejdz na gore']);
        await expect(bar.locator('.map-exits-bar__exit--custom')).toHaveText(['wejdz na gore']);

        // A strip along the bottom edge of the map, its full width.
        const map = (await page.locator('.map-panel-container').boundingBox())!;
        const strip = (await bar.boundingBox())!;
        expect(Math.abs(strip.y + strip.height - (map.y + map.height))).toBeLessThan(2);
        expect(Math.abs(strip.width - map.width)).toBeLessThan(2);
        await bar.locator('[data-exit="e"]').click();
        await expect.poll(() => getCommandLog(page)).toContain('e');
    });
});
