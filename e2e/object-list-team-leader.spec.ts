import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, waitForCommandInput} from './support/mocks';

// Kondycje puts a small crown on the team leader's shortcut; the window's
// settings cog can turn it off.
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

async function pushLocation(page: Page, leaderNum: number): Promise<void> {
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Hero', object_num: 100});
    await pushGmcp(page, GMCP_PATHS.OBJECTS_DATA, {
        '100': {desc: 'Hero', team: true, team_leader: leaderNum === 100},
        '101': {desc: 'Ally Fighter', team: true, team_leader: leaderNum === 101},
        '201': {desc: 'Angry Orc', hp: 4},
    });
    await pushGmcp(page, GMCP_PATHS.OBJECTS_NUMS, [100, 101, 201]);
}

test.describe('Kondycje: team leader crown', () => {
    test('marks the leading teammate, then us, and the cog turns it off', async ({page}) => {
        await gotoWithLayout(page);
        await pushLocation(page, 101);

        const list = page.locator('#objects-list');
        const crown = list.locator('.is-team-leader');
        await expect(list).toContainText('Ally Fighter');
        await expect(crown).toHaveCount(1);
        await expect(crown).toHaveAttribute('title', 'Prowadzi drużynę');
        await expect(crown).toHaveAttribute('data-object-id', '101');

        await pushLocation(page, 100);
        await expect(crown).toHaveCount(1);
        await expect(crown).toHaveText('@');
        await expect(crown).toHaveAttribute('title', 'Prowadzisz drużynę');

        await page.locator('[data-panel-id="objectList"] .panel-button--settings').click();
        await page.locator('.window-settings__toggle', {hasText: 'Korona przy numerze lidera drużyny'}).click();
        await page.keyboard.press('Escape');
        await expect(crown).toHaveCount(0);
        await expect(list).toContainText('Ally Fighter');
    });
});
