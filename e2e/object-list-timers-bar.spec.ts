import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, pushText, waitForCommandInput} from './support/mocks';

// The ObjectListTimersBar is only rendered when the layout manager is enabled
// and the objectList panel is present in a dock slot.
// We enable the layout manager by pre-seeding localStorage before page load,
// using the DEFAULT_LAYOUT structure (objectList docked in right dock, enabled: true).
const ENABLED_LAYOUT_STATE = JSON.stringify({
    enabled: true,
    enabledPanels: {objectList: true},
    docks: {
        left: {size: 200, slots: []},
        top: {size: 200, slots: []},
        right: {
            size: 360,
            slots: [
                {id: 'slot-map', panels: [{id: 'map', order: 0, size: 50}], size: 50},
                {id: 'slot-objectList', panels: [{id: 'objectList', order: 0, size: 50}], size: 50},
            ],
        },
    },
    floatingPanels: [],
    popupPanels: {},
    builtInPanels: {},
});

// Enable layout manager before the page loads by writing localStorage in addInitScript.
// Only sets the layout state if it isn't already enabled, so reloads preserve builtInPanels.
async function gotoWithLayout(page: Page): Promise<void> {
    await page.addInitScript((layoutState) => {
        try {
            const existing = localStorage.getItem('layoutManagerState');
            if (existing) {
                const parsed = JSON.parse(existing);
                // If already enabled, don't overwrite (preserves builtInPanels settings).
                if (parsed && parsed.enabled === true) return;
            }
        } catch {
            // ignore parse errors
        }
        localStorage.setItem('layoutManagerState', layoutState);
    }, ENABLED_LAYOUT_STATE);
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    // Wait for the layout manager body class to confirm it is active.
    await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
}

// Open the hamburger menu inside the object list header.
async function openObjectListMenu(page: Page): Promise<void> {
    // The hamburger toggle is .map-header-menu__toggle inside the docked panel header.
    // The objectList docked panel has data-panel-id="objectList".
    const toggle = page
        .locator('[data-panel-id="objectList"]')
        .locator('.map-header-menu__toggle');
    await toggle.waitFor({state: 'visible'});
    await toggle.click();
    // Wait for the dropdown to appear.
    await page.locator('.map-header-menu__dropdown').waitFor({state: 'visible'});
}

// Click a checkbox menu item by its label text. The menu closes after clicking.
async function clickMenuToggle(page: Page, label: string): Promise<void> {
    const item = page.locator('.map-header-menu__dropdown').getByText(label);
    await item.click();
}

// Activate sneak mode (moveMode=1) by pressing the moveMode key bind (Backquote).
async function activateSneakMode(page: Page): Promise<void> {
    // Focus the command input so keydown reaches the app
    await page.locator('#message-input').focus();
    await page.keyboard.press('Backquote');
}

// Wait until the timers bar is visible inside #objects-list.
async function waitForTimersBar(page: Page): Promise<ReturnType<Page['locator']>> {
    const bar = page.locator('#objects-list .object-list-timers-bar');
    await bar.waitFor({state: 'visible'});
    return bar;
}

test.describe('Object list timers bar', () => {
    test.describe('menu toggles', () => {
        test('hamburger menu shows four checkbox items', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);

            const dropdown = page.locator('.map-header-menu__dropdown');
            await expect(dropdown.getByText('Stan broni'), 'should show "Stan broni" toggle').toBeVisible();
            await expect(dropdown.getByText('Timer zaslony'), 'should show "Timer zaslony" toggle').toBeVisible();
            await expect(dropdown.getByText('Timer rozkazu'), 'should show "Timer rozkazu" toggle').toBeVisible();
            await expect(dropdown.getByText('Timer zaskoku'), 'should show "Timer zaskoku" toggle').toBeVisible();
        });

        test('all toggles start unchecked', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);

            const dropdown = page.locator('.map-header-menu__dropdown');
            // Each toggle item has a span with class map-header-menu__checkbox.
            // When checked it gains map-header-menu__checkbox--checked.
            const checkboxes = dropdown.locator('.map-header-menu__checkbox');
            const count = await checkboxes.count();
            expect(count, 'should have 4 checkboxes').toBe(4);

            for (let i = 0; i < count; i++) {
                await expect(
                    checkboxes.nth(i),
                    `checkbox ${i} should not be checked initially`,
                ).not.toHaveClass(/map-header-menu__checkbox--checked/);
            }
        });

        test('clicking "Stan broni" toggles its checkbox', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);

            const dropdown = page.locator('.map-header-menu__dropdown');
            const weaponItem = dropdown.locator('.map-header-menu__item', {hasText: 'Stan broni'});
            const weaponCheckbox = weaponItem.locator('.map-header-menu__checkbox');

            await expect(weaponCheckbox, 'should be unchecked initially').not.toHaveClass(/map-header-menu__checkbox--checked/);

            // Click the item to enable it (menu closes on click).
            await weaponItem.click();

            // Re-open to verify it persisted.
            await openObjectListMenu(page);
            const weaponItem2 = page.locator('.map-header-menu__dropdown').locator('.map-header-menu__item', {hasText: 'Stan broni'});
            const weaponCheckbox2 = weaponItem2.locator('.map-header-menu__checkbox');
            await expect(weaponCheckbox2, 'should be checked after toggle').toHaveClass(/map-header-menu__checkbox--checked/);
        });

        test('each toggle persists its setting across a page reload', async ({page}) => {
            await gotoWithLayout(page);

            // Enable "Timer zaslony"
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaslony');

            // Reload the page. The gotoWithLayout init script will NOT overwrite
            // layoutManagerState because the layout is already enabled (the guard condition
            // in gotoWithLayout only seeds when layout is not yet enabled).
            await page.reload();
            await waitForCommandInput(page);
            await ensureGameSocket(page);
            await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));

            // The timers bar should be visible (cover timer was enabled).
            const bar = page.locator('#objects-list .object-list-timers-bar');
            await expect(bar, 'timers bar should be visible after reload when cover timer is enabled').toBeVisible();

            // The menu should still show cover timer as checked after reload.
            await openObjectListMenu(page);
            const dropdown = page.locator('.map-header-menu__dropdown');
            const coverItem = dropdown.locator('.map-header-menu__item', {hasText: 'Timer zaslony'});
            const coverCheckbox = coverItem.locator('.map-header-menu__checkbox');
            await expect(coverCheckbox, 'cover timer toggle should be checked after reload').toHaveClass(/map-header-menu__checkbox--checked/);
        });
    });

    test.describe('timers bar visibility', () => {
        test('timers bar is absent when all toggles are off', async ({page}) => {
            await gotoWithLayout(page);

            // All toggles are off by default — bar should not be in the DOM.
            const bar = page.locator('#objects-list .object-list-timers-bar');
            await expect(bar, 'timers bar should not be visible when all toggles are off').not.toBeVisible();
        });

        test('timers bar appears inside #objects-list when at least one toggle is on', async ({page}) => {
            await gotoWithLayout(page);

            // Enable weapon state toggle.
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            const bar = await waitForTimersBar(page);
            await expect(bar, 'timers bar should appear after enabling a toggle').toBeVisible();

            // Verify the bar is a child of #objects-list and appears before .objects-list-content.
            const isBeforeContent = await page.evaluate(() => {
                const objectsList = document.getElementById('objects-list');
                if (!objectsList) return false;
                const bar = objectsList.querySelector('.object-list-timers-bar');
                const content = objectsList.querySelector('.objects-list-content');
                if (!bar || !content) return false;
                // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING = 4
                return (bar.compareDocumentPosition(content) & 4) !== 0;
            });
            expect(isBeforeContent, 'timers bar should appear before .objects-list-content').toBe(true);
        });

        test('timers bar disappears when all toggles are turned off', async ({page}) => {
            await gotoWithLayout(page);

            // Enable then disable weapon state.
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            const bar = page.locator('#objects-list .object-list-timers-bar');
            await expect(bar, 'bar should appear after enabling weapon state').toBeVisible();

            // Turn it off again.
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            await expect(bar, 'bar should disappear after disabling the last toggle').not.toBeVisible();
        });
    });

    test.describe('weapon state item', () => {
        test('shows "Bron: --" with gray value when toggled on before any event', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            const bar = await waitForTimersBar(page);
            const weaponItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Bron:'});
            await expect(weaponItem, 'weapon state item should be visible').toBeVisible();
            await expect(weaponItem, 'should show "--" before any event').toContainText('Bron: --');

            // The value span should have the --off (gray) class.
            const valueSpan = weaponItem.locator('span');
            await expect(valueSpan, 'initial value should have --off class').toHaveClass(/object-list-timers-bar__value--off/);
            await expect(valueSpan, 'initial value color should be gray').toHaveCSS('color', 'rgb(136, 136, 136)');
        });

        test('shows "Bron: on" in green after drawing weapon', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            await waitForTimersBar(page);

            await pushText(page, 'Trzymasz oburacz miecz.');

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const weaponItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Bron:'});
            await expect(weaponItem, 'should show "on" after drawing weapon').toContainText('Bron: on');

            const valueSpan = weaponItem.locator('span');
            await expect(valueSpan, 'value should have --on class').toHaveClass(/object-list-timers-bar__value--on/);
            await expect(valueSpan, 'value color should be springgreen').toHaveCSS('color', 'rgb(0, 255, 127)');
        });

        test('shows "Bron: off" in gray after sheathing weapon', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            await waitForTimersBar(page);

            // First draw, then sheathe
            await pushText(page, 'Trzymasz oburacz miecz.');
            await pushText(page, 'Opuszczasz miecz.');

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const weaponItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Bron:'});
            await expect(weaponItem, 'should show "off" after sheathing').toContainText('Bron: off');

            const valueSpan = weaponItem.locator('span');
            await expect(valueSpan, 'value should have --off class').toHaveClass(/object-list-timers-bar__value--off/);
            await expect(valueSpan, 'value color should be gray').toHaveCSS('color', 'rgb(136, 136, 136)');
        });

        test('weapon item updates correctly between on and off states', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            await waitForTimersBar(page);

            await pushText(page, 'Trzymasz oburacz miecz.');
            const bar = page.locator('#objects-list .object-list-timers-bar');
            const weaponItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Bron:'});
            await expect(weaponItem, 'should show "on" first').toContainText('Bron: on');

            await pushText(page, 'Opuszczasz miecz.');
            await expect(weaponItem, 'should switch to "off"').toContainText('Bron: off');

            await pushText(page, 'Trzymasz oburacz miecz.');
            await expect(weaponItem, 'should switch back to "on"').toContainText('Bron: on');
        });
    });

    test.describe('cover timer item', () => {
        test('shows "Zas: OK" in green when no active timer', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaslony');

            await waitForTimersBar(page);

            // Trigger and expire the cover timer so it transitions to "OK".
            await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');
            await page.clock.runFor(5500);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const coverItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zas:'});
            await expect(coverItem, 'should be visible').toBeVisible();
            await expect(coverItem, 'should show "OK" when inactive').toContainText('Zas: OK');

            const valueSpan = coverItem.locator('span');
            await expect(valueSpan, 'OK value should have --ready class').toHaveClass(/object-list-timers-bar__item--ready/);
            await expect(valueSpan, 'OK value color should be springgreen').toHaveCSS('color', 'rgb(0, 255, 127)');
        });

        test('shows countdown in yellow after successful cover via game output', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaslony');

            await waitForTimersBar(page);

            // Trigger cover timer with actual game output
            await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const coverItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zas:'});

            // Should show a countdown value (not "OK")
            const timerText = await coverItem.textContent();
            expect(timerText, 'should show countdown value').toMatch(/Zas: [0-9]\.[0-9]{2}/);

            const valueSpan = coverItem.locator('span');
            await expect(valueSpan, 'active value should have --active class').toHaveClass(/object-list-timers-bar__item--active/);
            await expect(valueSpan, 'active value color should be yellow').toHaveCSS('color', 'rgb(230, 192, 76)');
        });

        test('cover timer label stays default color regardless of state', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaslony');

            await waitForTimersBar(page);

            // Trigger and expire the cover timer to reach OK state.
            await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');
            await page.clock.runFor(5500);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const coverItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zas:'});

            // The item span itself should NOT have any color class (only the inner value span does).
            await expect(coverItem, 'cover item should not have --ready class on outer span when OK').not.toHaveClass(/object-list-timers-bar__item--ready/);

            // Trigger active state via game output
            await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');
            await expect(coverItem, 'cover item outer span should not have --active class').not.toHaveClass(/object-list-timers-bar__item--active/);
        });

        test('cover timer returns to OK after expiry', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaslony');

            await waitForTimersBar(page);

            // Trigger cover timer via game output
            await pushText(page, 'Zrecznie zaslaniasz Aldousa przed ciosami orka.');

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const coverItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zas:'});
            const timerText = await coverItem.textContent();
            expect(timerText, 'should show countdown initially').toMatch(/Zas: [0-9]\.[0-9]{2}/);

            // Wait for timer to expire (5 seconds + buffer)
            await page.clock.runFor(5500);

            await expect(coverItem, 'should return to OK after timer expires').toContainText('Zas: OK');
        });
    });

    test.describe('order timer item', () => {
        test('order timer item is not shown when player is not team leader', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');

            // No isTeamLeader event — default is false.
            // Also enable weapon state so the timers bar renders.
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            await waitForTimersBar(page);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const orderItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'});
            await expect(orderItem, 'order item should not be visible when not team leader').not.toBeVisible();
        });

        test('order timer item appears when player becomes team leader via GMCP', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');

            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            await waitForTimersBar(page);

            // Set leader via GMCP
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                '100': {desc: 'Player', team: true, team_leader: true},
            });

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const orderItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'});
            await expect(orderItem, 'order item should appear when player is team leader').toBeVisible();
        });

        test('order timer shows "Rozkaz: OK" in green when leader with no active timer', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');

            // Set leader via GMCP before waiting for bar
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                '100': {desc: 'Player', team: true, team_leader: true},
            });

            await waitForTimersBar(page);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const orderItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'});
            await expect(orderItem, 'should show "OK" when inactive').toContainText('Rozkaz: OK');

            const valueSpan = orderItem.locator('span');
            await expect(valueSpan, 'OK value should be green').toHaveClass(/object-list-timers-bar__item--ready/);
            await expect(valueSpan, 'OK color should be springgreen').toHaveCSS('color', 'rgb(0, 255, 127)');
        });

        test('order timer shows countdown in yellow after giving order via game output', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');

            // Set leader via GMCP before waiting for bar
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                '100': {desc: 'Player', team: true, team_leader: true},
            });

            await waitForTimersBar(page);

            // Trigger order timer via game output
            await pushText(page, 'Wydajesz rozkaz druzynie, by podazala za toba.');

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const orderItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'});

            // Should show a countdown value
            const timerText = await orderItem.textContent();
            expect(timerText, 'should show countdown after order').toMatch(/Rozkaz: \d+\.\d{2}/);

            const valueSpan = orderItem.locator('span');
            await expect(valueSpan, 'active value should have --active class').toHaveClass(/object-list-timers-bar__item--active/);
            await expect(valueSpan, 'active color should be yellow').toHaveCSS('color', 'rgb(230, 192, 76)');
        });

        test('order timer item hides when player loses team leadership', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');

            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            await waitForTimersBar(page);

            // Set leader via GMCP
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                '100': {desc: 'Player', team: true, team_leader: true},
            });

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const orderItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'});
            await expect(orderItem, 'order item should be visible as leader').toBeVisible();

            // Remove leadership — another player becomes leader
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                '200': {desc: 'OtherPlayer', team: true, team_leader: true},
            });
            await expect(orderItem, 'order item should hide when no longer leader').not.toBeVisible();
        });

        test('order timer only shows when toggle is on AND player is team leader (GMCP)', async ({page}) => {
            await gotoWithLayout(page);
            // Enable timer but do NOT send isTeamLeader.
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');

            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');

            await waitForTimersBar(page);

            // Set leader via GMCP (the real game path).
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                '100': {desc: 'Player', team: true, team_leader: true},
            });

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const orderItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'});
            await expect(orderItem, 'order item should appear after GMCP confirms team leader').toBeVisible();
        });
    });

    test.describe('zask timer item', () => {
        test('shows "Zask: --" with gray value when toggled on before any event', async ({page}) => {
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            const bar = await waitForTimersBar(page);
            const zaskItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'});
            await expect(zaskItem, 'zask item should be visible').toBeVisible();
            await expect(zaskItem, 'should show "--" before any event').toContainText('Zask: --');

            const valueSpan = zaskItem.locator('span');
            await expect(valueSpan, 'initial value should have --off class').toHaveClass(/object-list-timers-bar__value--off/);
            await expect(valueSpan, 'initial color should be gray').toHaveCSS('color', 'rgb(136, 136, 136)');
        });

        test('shows "Zask: OK" in green when ok is true', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            await waitForTimersBar(page);

            // Activate sneak mode, then push room.info to start the zask timer.
            await activateSneakMode(page);
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {num: 1, id: 1, name: 'Room', zone: 'Test', exits: {}, map: {x: 0, y: 0, name: 'Test'}});
            // Advance clock past the 30s safe threshold.
            await page.clock.runFor(31000);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const zaskItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'});
            await expect(zaskItem, 'should show "OK" when ok').toContainText('Zask: OK');

            const valueSpan = zaskItem.locator('span');
            await expect(valueSpan, 'OK value should have --ready class').toHaveClass(/object-list-timers-bar__item--ready/);
            await expect(valueSpan, 'OK color should be springgreen').toHaveCSS('color', 'rgb(0, 255, 127)');
        });

        test('shows zask seconds in yellow when seconds >= 20 and not ok', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            await waitForTimersBar(page);

            await activateSneakMode(page);
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {num: 1, id: 1, name: 'Room', zone: 'Test', exits: {}, map: {x: 0, y: 0, name: 'Test'}});
            // Advance clock to 25 seconds (>= 20, not yet 30).
            await page.clock.runFor(25500);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const zaskItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'});
            await expect(zaskItem, 'should show seconds >= 20').toContainText('Zask: 25');

            const valueSpan = zaskItem.locator('span');
            await expect(valueSpan, 'value >= 20s should have --active class').toHaveClass(/object-list-timers-bar__item--active/);
            await expect(valueSpan, 'color at >= 20s should be yellow').toHaveCSS('color', 'rgb(230, 192, 76)');
        });

        test('shows zask seconds in red when seconds < 20 and not ok', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            await waitForTimersBar(page);

            await activateSneakMode(page);
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {num: 1, id: 1, name: 'Room', zone: 'Test', exits: {}, map: {x: 0, y: 0, name: 'Test'}});
            // Advance clock to 10 seconds (< 20).
            await page.clock.runFor(10500);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const zaskItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'});
            await expect(zaskItem, 'should show seconds < 20').toContainText('Zask: 10');

            const valueSpan = zaskItem.locator('span');
            await expect(valueSpan, 'value < 20s should have --danger class').toHaveClass(/object-list-timers-bar__item--danger/);
            await expect(valueSpan, 'color at < 20s should be red').toHaveCSS('color', 'rgb(224, 80, 80)');
        });

        test('shows zask seconds in red at the boundary (seconds === 19)', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            await waitForTimersBar(page);

            await activateSneakMode(page);
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {num: 1, id: 1, name: 'Room', zone: 'Test', exits: {}, map: {x: 0, y: 0, name: 'Test'}});
            await page.clock.runFor(19500);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const zaskItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'});
            const valueSpan = zaskItem.locator('span');
            await expect(valueSpan, 'seconds === 19 should be danger (red)').toHaveClass(/object-list-timers-bar__item--danger/);
        });

        test('shows zask seconds in yellow at the boundary (seconds === 20)', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            await waitForTimersBar(page);

            await activateSneakMode(page);
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {num: 1, id: 1, name: 'Room', zone: 'Test', exits: {}, map: {x: 0, y: 0, name: 'Test'}});
            await page.clock.runFor(20500);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const zaskItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'});
            const valueSpan = zaskItem.locator('span');
            await expect(valueSpan, 'seconds === 20 should be active (yellow)').toHaveClass(/object-list-timers-bar__item--active/);
        });

        test('zask timer transitions from null back to "--" display', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            await waitForTimersBar(page);

            // Activate sneak and push room.info to start timer, then advance past threshold.
            await activateSneakMode(page);
            await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {num: 1, id: 1, name: 'Room', zone: 'Test', exits: {}, map: {x: 0, y: 0, name: 'Test'}});
            await page.clock.runFor(31000);

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const zaskItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'});
            await expect(zaskItem, 'should show OK first').toContainText('Zask: OK');

            // Deactivate sneak mode (toggle back to mode 0) to stop the timer → emits null.
            await activateSneakMode(page);
            await expect(zaskItem, 'should return to "--" when payload is null').toContainText('Zask: --');
        });
    });

    test.describe('timers bar countdown (cover and order timers run)', () => {
        test('cover timer counts down after game output trigger', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaslony');

            await waitForTimersBar(page);

            // Trigger cover timer via game output
            await pushText(page, 'Z wprawa stajesz pomiedzy Cedrikiem a trolem, przyjmujac na siebie nadchodzace ciosy.');

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const coverItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Zas:'});

            // Should show countdown initially. Poll: the trigger propagates
            // through an event + React re-render, so reading once immediately
            // races the update (flaky under CI load).
            await expect(coverItem, 'should show countdown after trigger').toContainText(/Zas: [0-9]\.[0-9]{2}/);

            // Advance time — value should decrease
            await page.clock.runFor(2000);
            await expect(coverItem, 'should show lower value after 2s').toContainText(/Zas: [0-9]\.[0-9]{2}/);

            // Timer should expire after 5s total
            await page.clock.runFor(3500);
            await expect(coverItem, 'should show OK after timer expires').toContainText('Zas: OK');
        });

        test('order timer counts down after game output trigger', async ({page}) => {
            await page.clock.install();
            await gotoWithLayout(page);
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');

            // Set leader via GMCP so order timer trigger works
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                '100': {desc: 'Player', team: true, team_leader: true},
            });

            await waitForTimersBar(page);

            // Trigger order timer via game output
            await pushText(page, 'Wydajesz rozkaz druzynie, by podazala za toba.');

            const bar = page.locator('#objects-list .object-list-timers-bar');
            const orderItem = bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'});

            // Should show countdown. Poll: the trigger propagates through an
            // event + React re-render, so reading once immediately races the
            // update (flaky under CI load).
            await expect(orderItem, 'should show countdown after order').toContainText(/Rozkaz: \d+\.\d{2}/);

            // Advance time — value should decrease
            await page.clock.runFor(5000);
            await expect(orderItem, 'should show lower value after 5s').toContainText(/Rozkaz: \d+\.\d{2}/);

            // Timer should expire after 15s total
            await page.clock.runFor(10500);
            await expect(orderItem, 'should show OK after timer expires').toContainText('Rozkaz: OK');
        });
    });

    test.describe('multiple items visible simultaneously', () => {
        test('all four items visible when all toggles on and player is team leader', async ({page}) => {
            await gotoWithLayout(page);

            // Enable all four toggles.
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaslony');
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            // Set leader via GMCP
            await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Player', object_num: 100});
            await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
                '100': {desc: 'Player', team: true, team_leader: true},
            });

            const bar = await waitForTimersBar(page);

            await expect(bar.locator('.object-list-timers-bar__item', {hasText: 'Bron:'}), 'weapon item visible').toBeVisible();
            await expect(bar.locator('.object-list-timers-bar__item', {hasText: 'Zas:'}), 'cover item visible').toBeVisible();
            await expect(bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'}), 'order item visible').toBeVisible();
            await expect(bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'}), 'zask item visible').toBeVisible();

            const items = bar.locator('.object-list-timers-bar__item');
            await expect(items, 'should have exactly 4 timer items').toHaveCount(4);
        });

        test('order item is hidden among others when player is not team leader', async ({page}) => {
            await gotoWithLayout(page);

            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Stan broni');
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaslony');
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer rozkazu');
            await openObjectListMenu(page);
            await clickMenuToggle(page, 'Timer zaskoku');

            // Do NOT set team leader.

            const bar = await waitForTimersBar(page);

            await expect(bar.locator('.object-list-timers-bar__item', {hasText: 'Bron:'}), 'weapon item visible').toBeVisible();
            await expect(bar.locator('.object-list-timers-bar__item', {hasText: 'Zas:'}), 'cover item visible').toBeVisible();
            await expect(bar.locator('.object-list-timers-bar__item', {hasText: 'Rozkaz:'}), 'order item NOT visible').not.toBeVisible();
            await expect(bar.locator('.object-list-timers-bar__item', {hasText: 'Zask:'}), 'zask item visible').toBeVisible();

            // Only 3 items actually rendered (order is conditional).
            const items = bar.locator('.object-list-timers-bar__item');
            await expect(items, 'should have 3 timer items without order').toHaveCount(3);
        });
    });
});
