import {expect, test} from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    GMCP_PATHS,
    pushGmcp,
    pushText,
    resetCommandLog,
    submitCommand,
    waitForCharacter,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';
import type {Page} from '@playwright/test';
import {openSettings, saveSettings} from './support/settings';

async function enableLayoutManager(page: Page): Promise<void> {
    await openSettings(page, 'ui-windows');
    const layoutToggle = page.locator('#ui-layout-manager-enabled');
    if (!(await layoutToggle.isChecked())) await layoutToggle.click();
    await saveSettings(page);
    await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
}

// Open the loot popup with a single body holding two items. The loot popup is
// a convenient, interactive dockable popup to exercise the popout feature.
async function openLootPopup(page: Parameters<typeof waitForCommandInput>[0]) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'PopoutTester', object_num: 70030});
    await waitForCharacter(page, 'PopoutTester');

    await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
        num: 1,
        id: 1,
        name: 'Test Room',
        zone: 'Miasteczko Poslan',
        exits: {},
        map: {x: 0, y: 0, name: 'Miasteczko Poslan'},
    });
    await page.waitForTimeout(200);
    await pushText(page, 'Cialo jakiegos trolla', {type: 'room.contents.object'});
    await page.waitForTimeout(100);

    await submitCommand(page, '/loot');
    await page.waitForTimeout(100);
    await pushText(page, 'Jest to martwe cialo jakiegos trolla.');
    await pushText(page, 'Zauwazasz przy nim miecz i tarcze.');

    const popup = page.locator('.loot-popup');
    await expect(popup, 'loot popup should be visible').toBeVisible({timeout: 5000});
    return popup;
}

test.describe('Popout windows', () => {
    test('pops a popup into a separate window and restores it on close', async ({page, context}) => {
        const popup = await openLootPopup(page);

        // Pop out into its own browser window.
        const popoutButton = popup.locator('.panel-button--popout').first();
        await expect(popoutButton, 'popout button should be visible').toBeVisible();

        const [popout] = await Promise.all([
            context.waitForEvent('page'),
            popoutButton.click(),
        ]);

        // The popped-out window should contain the same popup content...
        const popoutContent = popout.locator('.loot-popup__content');
        await expect(popoutContent, 'content should render in the popped-out window')
            .toContainText('jakiegos trolla', {timeout: 5000});

        // ...and it should have left the main window.
        await expect(popup, 'popup should leave the main window while popped out')
            .not.toBeVisible();

        // Closing the popout window restores the popup back to the main window.
        await popout.close();
        await expect(popup, 'popup should return to the main window on close')
            .toBeVisible({timeout: 5000});
        await expect(popup.locator('.loot-popup__content'), 'content should still be intact after restore')
            .toContainText('jakiegos trolla');
    });

    test('content stays interactive inside the popped-out window', async ({page, context}) => {
        const popup = await openLootPopup(page);

        const [popout] = await Promise.all([
            context.waitForEvent('page'),
            popup.locator('.panel-button--popout').first().click(),
        ]);

        const miecz = popout.locator('.loot-popup__item', {hasText: 'miecz'});
        await expect(miecz, 'item should render in the popped-out window').toBeVisible({timeout: 5000});

        await resetCommandLog(page);
        // Clicking inside the popped-out window must drive the main-window client.
        await miecz.click();

        await expect
            .poll(async () => getCommandLog(page), {
                message: 'click in popout window should send the command via the main client',
                timeout: 3000,
            })
            .toEqual(expect.arrayContaining(['wez miecz z ciala jakiegos trolla']));

        // The clicked item is consumed; the other item remains.
        await expect(miecz, 'collected item should disappear from the popout').not.toBeVisible();
        await expect(
            popout.locator('.loot-popup__item', {hasText: 'tarcze'}),
            'remaining item should still be visible in the popout',
        ).toBeVisible();
    });

    test('restores via the popped-out window header button', async ({page, context}) => {
        const popup = await openLootPopup(page);

        const [popout] = await Promise.all([
            context.waitForEvent('page'),
            popup.locator('.panel-button--popout').first().click(),
        ]);

        const restoreButton = popout.locator('.panel-button--popout-restore');
        await expect(restoreButton, 'restore button should be visible in the popout').toBeVisible({timeout: 5000});
        await restoreButton.click();

        await expect(popup, 'popup should return to the main window after restore click')
            .toBeVisible({timeout: 5000});
    });

    test('popped-out window mirrors the opener\'s styles, including ones added later', async ({page, context}) => {
        const popup = await openLootPopup(page);
        const panelFont = await popup.evaluate(el => getComputedStyle(el).fontFamily);

        const [popout] = await Promise.all([
            context.waitForEvent('page'),
            popup.locator('.panel-button--popout').first().click(),
        ]);
        const content = popout.locator('.loot-popup__content');
        await expect(content, 'content should render in the popped-out window').toBeVisible({timeout: 5000});

        // The bundled stylesheets reached the popout: same font as in the main window.
        expect(await popout.locator('.loot-popup').evaluate(el => getComputedStyle(el).fontFamily)).toBe(panelFont);

        // A stylesheet added to the opener at runtime (theme, plugin) follows.
        await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = '.loot-popup__content { outline: 3px solid rgb(1, 2, 3); }';
            document.head.appendChild(style);
        });
        await expect
            .poll(() => content.evaluate(el => getComputedStyle(el).outlineColor), {timeout: 3000})
            .toBe('rgb(1, 2, 3)');

        // A popout is narrower than the mobile breakpoint, but it is not a phone:
        // buttons must not pick up the mobile 8vmin touch-target minimum.
        const button = await popout.evaluate(() => {
            const probe = document.createElement('button');
            document.querySelector('.popout-root .loot-popup')!.appendChild(probe);
            const {minHeight} = getComputedStyle(probe);
            probe.remove();
            return {minHeight, width: window.innerWidth};
        });
        expect(button.width, 'popout should be narrower than the mobile breakpoint').toBeLessThanOrEqual(768);
        expect(button.minHeight).not.toMatch(/^[1-9]/);
    });

    test('map screenshot works from a popped-out window (clipboard targets the focused window)', async ({page, context}) => {
        test.setTimeout(40000);
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'PopoutTester', object_num: 12345});
        await waitForCharacter(page, 'PopoutTester');
        await enableLayoutManager(page);
        await waitForMapReady(page);

        const mapPanel = page.locator('.docked-panel--map');
        await expect(mapPanel).toBeVisible({timeout: 5000});

        const [popout] = await Promise.all([
            context.waitForEvent('page'),
            mapPanel.locator('.panel-button--popout').first().click(),
        ]);

        // The map (Konva canvases) should have moved into the popout window.
        await popout.waitForFunction(() => {
            const m = document.getElementById('map');
            return !!m && m.querySelectorAll('canvas').length > 0;
        }, {timeout: 10000});

        // Trigger "copy as image" from inside the popped-out window.
        const copyBtn = popout.getByTitle('Kopiuj jako obraz');
        await expect(copyBtn, 'map screenshot button should be visible in the popout').toBeVisible();
        await copyBtn.click();

        // The clipboard write must have targeted the focused (popout) window —
        // verify an image landed on the clipboard.
        await expect
            .poll(
                async () =>
                    popout.evaluate(async () => {
                        const items = await navigator.clipboard.read();
                        return items.flatMap(i => i.types);
                    }),
                {message: 'popout clipboard should contain a PNG screenshot', timeout: 5000},
            )
            .toContain('image/png');
    });
});
