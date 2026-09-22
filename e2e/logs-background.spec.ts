import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushGmcp, pushText, waitForCharacter, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

async function login(page: Page): Promise<void> {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await pushGmcp(page, 'char.info', {name: 'Tester', object_num: 12345});
    await waitForCharacter(page, 'Tester');
}

async function openLogs(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#logs-button');
    await page.waitForSelector('#logs-modal:not([hidden])', {timeout: 5000});
    await expect(page.locator('.lv')).toBeVisible();
}

const setOutputBackground = (page: Page, color: string) =>
    page.evaluate((value) => document.body.style.setProperty('--output-bg', value), color);

test.describe('Logi background', () => {
    test('a log reads on the output background it was recorded with', async ({page}) => {
        await login(page);
        await setOutputBackground(page, '#f5efe0');
        await pushText(page, 'Nagrane na jasnym tle.');

        // Changed after the lines were written: the log keeps its own ground.
        await setOutputBackground(page, '#101010');
        await openLogs(page);
        const pane = page.locator('.lv-log');
        await expect(pane).toContainText('Nagrane na jasnym tle.');
        await expect(pane).toHaveCSS('background-color', 'rgb(245, 239, 224)');
        await expect(pane).toHaveAttribute('data-ground', 'light');
    });

    test('text on a dark output background stays light on a light theme', async ({page}) => {
        await login(page);
        await setOutputBackground(page, '#242424');
        await page.evaluate(() => document.body.classList.add('theme-light-silver'));
        await pushText(page, 'Ciemne okno gry.');
        await openLogs(page);
        const pane = page.locator('.lv-log');
        await expect(pane).toHaveAttribute('data-ground', 'dark');
        await expect(pane.locator('.lv-log__text', {hasText: 'Ciemne okno gry.'})).toHaveCSS('color', 'rgb(238, 238, 236)');
    });
});
