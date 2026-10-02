import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getLastOutgoingCommand, GMCP_PATHS, pushGmcp, waitForCommandInput} from './support/mocks';
import {openSettings, waitForSettingsModalClosed} from './support/settings';

// Kondycje's "Pozostali w osobnym oknie" moves everyone outside the team into
// a second layout window and drops them from Kondycje itself.
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

async function gotoWithLayout(page: Page): Promise<void> {
    await page.addInitScript((layoutState) => {
        if (!localStorage.getItem('layoutManagerState')) {
            localStorage.setItem('layoutManagerState', layoutState);
        }
    }, ENABLED_LAYOUT_STATE);
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
}

async function pushLocation(page: Page): Promise<void> {
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
    await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
        '100': {desc: 'Hero', team: true, team_leader: true},
        '101': {desc: 'Ally Fighter', team: true, num: 101},
        '201': {desc: 'Angry Orc', num: 201, hp: 4},
    });
    await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101, 201]);
}

async function toggleSeparateOthers(page: Page): Promise<void> {
    await page.locator('[data-panel-id="objectList"] .panel-button--settings').click();
    await page.locator('.window-settings__toggle', {hasText: 'Pozostali w osobnym oknie'}).click();
    await page.keyboard.press('Escape');
}

test.describe('Kondycje: non-team objects in their own window', () => {
    test('splits the list and puts it back', async ({page}) => {
        await gotoWithLayout(page);
        await pushLocation(page);

        const main = page.locator('#objects-list');
        const others = page.locator('#objects-list-others');
        await expect(main).toContainText('Angry Orc');
        await expect(others).toBeHidden();

        await toggleSeparateOthers(page);

        await expect(page.locator('[data-panel-id="objectListOthers"]')).toBeVisible();
        await expect(others).toBeVisible();
        await expect(others).toContainText('Angry Orc');
        await expect(others).not.toContainText('Ally Fighter');
        await expect(main).toContainText('Ally Fighter');
        await expect(main).not.toContainText('Angry Orc');

        // Clicking in the new window still attacks.
        await others.locator('.object-num').first().click();
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('zabij ob_201');

        // Survives a reload.
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushLocation(page);
        await expect(others).toContainText('Angry Orc');
        await expect(main).not.toContainText('Angry Orc');

        await toggleSeparateOthers(page);
        await expect(page.locator('[data-panel-id="objectListOthers"]')).toHaveCount(0);
        await expect(main).toContainText('Angry Orc');
    });

    test('the UI settings checkbox is the same setting as the cog toggle', async ({page}) => {
        await gotoWithLayout(page);
        await pushLocation(page);

        const modal = await openSettings(page, 'ui-windows');
        const checkbox = modal.locator('#ui-layout-manager-separate-others');
        await expect(checkbox).not.toBeChecked();
        await checkbox.check();
        await page.keyboard.press('Escape');
        await waitForSettingsModalClosed(page);

        // Applied at once, no Save needed.
        await expect(page.locator('#objects-list-others')).toContainText('Angry Orc');
        await expect(page.locator('#objects-list')).not.toContainText('Angry Orc');

        await toggleSeparateOthers(page);
        await expect(page.locator('[data-panel-id="objectListOthers"]')).toHaveCount(0);

        await openSettings(page, 'ui-windows');
        await expect(checkbox).not.toBeChecked();
    });
});
