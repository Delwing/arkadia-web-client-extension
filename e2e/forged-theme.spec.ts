import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';

test.describe('Kuźnia theme', () => {
    test('picked in the settings, it forges the windows: iron plate, bronze Cinzel titles', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openSettings(page, 'ui-windows');
        await modal.locator('#ui-layout-manager-enabled').check();
        await saveSettings(page);
        const window = page.locator('.managed-panel').first();
        const title = window.locator('.managed-panel__title').first();
        await expect(title).toBeVisible();
        await expect(title).not.toHaveCSS('font-family', /Cinzel/);

        await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-color-theme').selectOption('forged');
        await saveSettings(page);

        await expect(page.locator('body')).toHaveClass(/\btheme-forged\b/);
        await expect(title).toHaveCSS('font-family', /Cinzel/);
        await expect(title).toHaveCSS('color', 'rgb(184, 150, 90)');
        await expect(window).toHaveCSS('border-radius', '9px');
    });

    test('its footer is the forged plate: the vitals as stone gems, the stock bands kept', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 800});
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushGmcp(page, 'char.state', {hp: 5, fatigue: 2, mana: 7});
        const footer = page.locator('#footer-layout');
        await expect(footer.locator('#char-state-vitals .vital').first()).toBeVisible();
        await expect(footer.locator('.gem')).toHaveCount(0);

        const modal = await openSettings(page, 'ui-appearance');
        await modal.locator('#ui-color-theme').selectOption('forged');
        await saveSettings(page);

        await expect(footer.locator('.gem')).toHaveCount(3);
        await expect(footer.locator('.gem').first()).toContainText('6/7');
        await expect(footer.locator('#char-state-vitals')).toHaveCount(0);
        await expect(footer.locator('#char-state')).toBeVisible();
        await expect(footer).toHaveCSS('border-top-left-radius', '9px');
        await expect(page.locator('#input-area')).toHaveCSS('border-bottom-left-radius', '9px');
    });

    test('the location name reads as the forge heading, in bronze whatever the game coloured it', async ({page}) => {
        await page.addInitScript(() => {
            const raw = localStorage.getItem('uiSettings');
            const settings = raw ? JSON.parse(raw) : {};
            localStorage.setItem('uiSettings', JSON.stringify({...settings, colorTheme: 'forged'}));
        });
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await pushText(page, '\x1b[1;33mTrakt przy mlynie.\x1b[0m', {type: 'room.short'});

        const heading = page.locator('#main_text_output_msg_wrapper .output_msg.room\\.short .output_msg_content');
        await expect(heading).toHaveText('Trakt przy mlynie.');
        await expect(heading).toHaveCSS('font-family', /Cinzel/);
        await expect(heading).toHaveCSS('text-transform', 'uppercase');
        await expect(heading.locator('span').first()).toHaveCSS('color', 'rgb(184, 150, 90)');
    });
});
