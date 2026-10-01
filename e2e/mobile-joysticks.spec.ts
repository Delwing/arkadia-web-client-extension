import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, getLastOutgoingCommand, waitForCommandInput} from './support/mocks';
import {SETTINGS_MODAL, openSettings, saveSettings} from './support/settings';

const JOYSTICKS = {
    enabled: true,
    items: [
        {
            id: 'compass',
            label: '',
            center: 'zerknij',
            commands: {n: 'n', ne: 'ne', e: 'e', se: 'se', s: 's', sw: 'sw', w: 'w', nw: 'nw'},
            size: 140,
            color: '#6CA6CD',
            fontColor: '#f1f5f9',
        },
        {
            id: 'vertical',
            label: 'pion',
            center: '',
            commands: {n: 'u', s: 'd'},
            size: 90,
            color: '#6CA6CD',
            fontColor: '#f1f5f9',
        },
    ],
};

async function boot(page: Page, joysticks: unknown = JOYSTICKS) {
    if (joysticks) {
        await page.addInitScript((value) => {
            if (sessionStorage.getItem('joystick-seeded')) return;
            sessionStorage.setItem('joystick-seeded', '1');
            localStorage.setItem('mobileButtonSettings', JSON.stringify({joysticks: value}));
        }, joysticks);
    }
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
}

async function centerOf(page: Page, id: string) {
    const box = await page.locator(`.mobile-joystick[data-joystick-id="${id}"]`).boundingBox();
    expect(box, `joystick ${id} should be on screen`).not.toBeNull();
    return {x: box!.x + box!.width / 2, y: box!.y + box!.height / 2};
}

async function swipe(page: Page, id: string, dx: number, dy: number) {
    const c = await centerOf(page, id);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + dx / 2, c.y + dy / 2);
    await page.mouse.move(c.x + dx, c.y + dy);
    await page.mouse.up();
}

test.describe('Mobile joysticks', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 500, height: 900});
    });

    test('are off until enabled', async ({page}) => {
        await boot(page, null);
        await expect(page.locator('.mobile-joystick')).toHaveCount(0);
    });

    test('a swipe sends the command of its direction', async ({page}) => {
        await boot(page);
        await expect(page.locator('.mobile-joystick')).toHaveCount(2);

        await swipe(page, 'compass', 0, -50);
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('n');

        await swipe(page, 'compass', -40, 40);
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('sw');

        // Two directions split the circle: a slanted swipe still lands on the nearer one.
        await swipe(page, 'vertical', 20, 40);
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('d');
    });

    test('a tap sends the centre command', async ({page}) => {
        await boot(page);
        const c = await centerOf(page, 'compass');
        await page.mouse.click(c.x, c.y);
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('zerknij');
    });

    test('a long press shows the commands and then drags the joystick', async ({page}) => {
        await boot(page);
        const joystick = page.locator('.mobile-joystick[data-joystick-id="vertical"]');
        const before = await centerOf(page, 'vertical');

        await page.mouse.move(before.x, before.y);
        await page.mouse.down();
        await expect(joystick.locator('.mobile-joystick__tag')).toHaveText(['u', 'd']);

        await page.mouse.move(before.x - 60, before.y - 80, {steps: 5});
        await page.mouse.up();

        const after = await centerOf(page, 'vertical');
        expect(Math.round(after.x)).toBe(Math.round(before.x - 60));
        expect(Math.round(after.y)).toBe(Math.round(before.y - 80));

        const sent = await getLastOutgoingCommand(page);
        expect(sent, 'dragging sends nothing').not.toBe('u');

        await page.reload();
        await waitForCommandInput(page);
        const reloaded = await centerOf(page, 'vertical');
        expect(Math.round(reloaded.x)).toBe(Math.round(after.x));
        expect(Math.round(reloaded.y)).toBe(Math.round(after.y));
    });

    test('are added and enabled from the Joysticki settings page', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 900});
        await boot(page, null);

        await openSettings(page, 'ui-joysticks');
        const settings = page.locator(`${SETTINGS_MODAL} .settings-page[data-settings-category="ui-joysticks"]`);
        await settings.locator('#mobile-joysticks-enabled').check();
        await settings.locator('#mobile-joysticks-add').click();
        const card = settings.locator('.joystick-editor__card').last();
        await card.locator('input[placeholder="e"]').fill('wschod');
        await saveSettings(page);

        await expect(page.locator('.mobile-joystick')).toHaveCount(3);
        const id = await page.locator('.mobile-joystick').last().getAttribute('data-joystick-id');
        await swipe(page, id!, 50, 0);
        await expect.poll(() => getLastOutgoingCommand(page)).toBe('wschod');
    });
});
