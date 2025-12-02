import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, GMCP_PATHS, pushGmcp, waitForCommandInput} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const OPTIONS_BUTTON = '#options-button';
const OPTIONS_MODAL = '#options-modal';
const LOW_HP_ALERT_SELECT = '#lowHpAlert';

async function openOptionsModal(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(OPTIONS_BUTTON);
    const modal = page.locator(OPTIONS_MODAL);
    await expect(modal, 'should open options modal').toBeVisible();
    return modal;
}

async function setLowHpAlert(page: Page, level: number) {
    const modal = await openOptionsModal(page);
    await modal.locator(LOW_HP_ALERT_SELECT).selectOption(String(level));
    // Save settings by clicking the "Zapisz" button
    await modal.locator('#options-save').click();
    await expect(modal, 'should close options modal after saving').not.toBeVisible();
}

// Login to enable settings (settings are locked until char.info is received)
async function loginForSettings(page: Page) {
    await pushGmcp(page, GMCP_PATHS.CHAR_INFO, {name: 'Tester', object_num: 12345});
}

test.describe('HP alert', () => {
    test('alerts when HP drops below threshold', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login to enable settings
        await loginForSettings(page);

        // Configure HP alert threshold to 2 (ciezko ranny) via UI
        await setLowHpAlert(page, 2);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Start with good HP (state 6 = in good condition)
        await pushGmcp(page, 'char.state', {hp: 6});

        // Drop HP to 1 (ciezko ranny - seriously wounded)
        await pushGmcp(page, 'char.state', {hp: 1});

        // Should show alert message
        await expect(output, 'should display HP alert message').toContainText('Jestes ciezko ranny');

        // Check that the message is styled in orange
        const alertMessage = output.locator('span').filter({hasText: 'Jestes ciezko ranny'}).last();
        await expect(alertMessage, 'should display alert message with orange color').toHaveCSS(
            'color',
            'rgb(255, 165, 0)'
        );
    });

    test('alerts on further HP decrease', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login to enable settings
        await loginForSettings(page);

        // Configure HP alert threshold to 2 via UI
        await setLowHpAlert(page, 2);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Start with HP at 2
        await pushGmcp(page, 'char.state', {hp: 2});

        // Drop to 1 (ciezko ranny)
        await pushGmcp(page, 'char.state', {hp: 1});

        await expect(output, 'should display first alert').toContainText('Jestes ciezko ranny');

        // Drop to 0 (ledwo zywy - barely alive)
        await pushGmcp(page, 'char.state', {hp: 0});

        await expect(output, 'should display second alert').toContainText('Jestes ledwo zywy');
    });

    test('does not alert when HP rises', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login to enable settings
        await loginForSettings(page);

        // Configure HP alert threshold to 2 via UI
        await setLowHpAlert(page, 2);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Start with low HP
        await pushGmcp(page, 'char.state', {hp: 2});

        // Wait a bit
        await page.waitForTimeout(100);

        // Get initial output content
        const initialContent = await output.textContent();

        // Increase HP
        await pushGmcp(page, 'char.state', {hp: 4});

        // Wait a bit
        await page.waitForTimeout(100);

        // Get final output content
        const finalContent = await output.textContent();

        // Content should be the same (no new alerts when HP rises)
        expect(finalContent).toBe(initialContent);
    });

    test('does not alert when disabled', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login to enable settings
        await loginForSettings(page);

        // Disable HP alert via UI (level 0)
        await setLowHpAlert(page, 0);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Get initial content
        const initialContent = await output.textContent();

        // Start with good HP
        await pushGmcp(page, 'char.state', {hp: 6});

        // Drop HP significantly
        await pushGmcp(page, 'char.state', {hp: 1});

        // Wait a bit
        await page.waitForTimeout(100);

        // Get final content
        const finalContent = await output.textContent();

        // Should not show any HP alerts
        expect(finalContent).toBe(initialContent);
        await expect(output, 'should not show HP alert when disabled').not.toContainText('ciezko ranny');
    });

    test('higher threshold expands alert range', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login to enable settings
        await loginForSettings(page);

        // Set threshold to 3 (w zlej kondycji) via UI
        await setLowHpAlert(page, 3);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Start with good HP
        await pushGmcp(page, 'char.state', {hp: 4});

        // Drop to 2 (w zlej kondycji - in bad condition)
        await pushGmcp(page, 'char.state', {hp: 2});

        // Should show alert for this condition
        await expect(output, 'should display alert for higher threshold').toContainText('Jestes w zlej kondycji');
    });

    test('shows different messages for different HP levels', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Login to enable settings
        await loginForSettings(page);

        // Set threshold to 5 (lekko ranny) via UI
        await setLowHpAlert(page, 5);

        const output = page.locator('#main_text_output_msg_wrapper');

        // Test different HP levels and their messages
        // Note: GMCP hp values are 0-indexed, but code adds 1, so:
        // GMCP 3 → internal 4 → "ranny"
        // GMCP 2 → internal 3 → "w zlej kondycji"
        // GMCP 1 → internal 2 → "ciezko ranny"
        // GMCP 0 → internal 1 → "ledwo zywy"
        const hpLevels = [
            {hp: 3, message: 'Jestes ranny'},
            {hp: 2, message: 'Jestes w zlej kondycji'},
            {hp: 1, message: 'Jestes ciezko ranny'},
            {hp: 0, message: 'Jestes ledwo zywy'},
        ];

        for (const level of hpLevels) {
            // Reset to high HP
            await pushGmcp(page, 'char.state', {hp: 6});
            await page.waitForTimeout(50);

            // Drop to test HP
            await pushGmcp(page, 'char.state', {hp: level.hp});
            await page.waitForTimeout(50);

            // Check for expected message
            await expect(output, `should display correct message for HP ${level.hp}`).toContainText(level.message);
        }
    });
});
