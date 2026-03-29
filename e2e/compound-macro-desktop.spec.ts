import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    getCommandLog,
    resetCommandLog,
    waitForCommandInput,
} from './support/mocks';
import { Page } from '@playwright/test';

const MENU_BUTTON = '#menu-button';
const MOBILE_BUTTONS_BUTTON = '#mobile-buttons-button';
const MOBILE_BUTTONS_MODAL = '#mobile-buttons-modal';

async function openButtonsSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(MOBILE_BUTTONS_BUTTON);
    const modal = page.locator(MOBILE_BUTTONS_MODAL);
    await expect(modal).toBeVisible();
    return modal;
}

async function switchToDesktopTab(page: Page) {
    await page.getByRole('button', { name: 'Przyciski', exact: true }).click();
}

test.describe('Desktop buttons compound macro', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
    });

    test('compound macro UI shows steps editor in desktop buttons', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await openButtonsSettings(page);
        await switchToDesktopTab(page);

        // Add a new desktop button
        await page.getByText('+ Dodaj przycisk').click();

        // Select the macro type as compound
        const macroSelect = page.locator('select').filter({ has: page.locator('option[value="compound"]') }).first();
        await macroSelect.selectOption('compound');

        // Steps editor should appear
        await expect(page.getByText('Kroki')).toBeVisible();
        await expect(page.getByText('+ Dodaj krok')).toBeVisible();
    });

    test('can add and configure compound steps for desktop button', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await openButtonsSettings(page);
        await switchToDesktopTab(page);

        // Add a new desktop button
        await page.getByText('+ Dodaj przycisk').click();

        // Set macro to compound first (so we can interact with the edit panel)
        const macroSelect = page.locator('select').filter({ has: page.locator('option[value="compound"]') }).first();
        await macroSelect.selectOption('compound');

        // Set label via the Etykieta field in the edit panel
        const editPanel = page.locator('.border.rounded.p-3.mb-3');
        const labelInput = editPanel.locator('input[type="text"]').first();
        await labelInput.fill('DeskCombo');

        // Add two steps
        await page.getByText('+ Dodaj krok').click();
        await page.getByText('+ Dodaj krok').click();
        await expect(page.getByText('Krok 1')).toBeVisible();
        await expect(page.getByText('Krok 2')).toBeVisible();

        // Configure step 1 as command
        const stepContainers = page.locator('.border.rounded.mb-2.p-2');
        const step1Select = stepContainers.nth(0).locator('select').first();
        await step1Select.selectOption('command');
        await stepContainers.nth(0).locator('textarea').fill('wstaw miecz');

        // Configure step 2 as command
        const step2Select = stepContainers.nth(1).locator('select').first();
        await step2Select.selectOption('command');
        await stepContainers.nth(1).locator('textarea').fill('wyjmij topor');

        // Save
        await page.locator('#desktop-buttons-save').click();
    });

    test('desktop compound macro button sends all step commands', async ({ page }) => {
        // Pre-configure a desktop compound button via localStorage
        await page.addInitScript(() => {
            const settings = {
                buttons: [
                    {
                        id: 'desktop-btn-1',
                        label: 'DeskCombo',
                        macroType: 'compound',
                        command: '',
                        color: '#6EB4DC',
                        fontColor: '#f1f5f9',
                        fontSize: 11,
                        width: 80,
                        height: 36,
                        x: 100,
                        y: 100,
                        backgroundOpacity: 0.85,
                        steps: [
                            { macroType: 'command', command: 'zerknij' },
                            { macroType: 'command', command: 'ekwipunek' },
                        ],
                    },
                ],
                locked: true,
            };
            localStorage.setItem('desktopButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);

        // Click the desktop button
        const desktopBtn = page.locator('#desktop-buttons-container .desktop-button').first();
        await expect(desktopBtn).toBeVisible();
        await desktopBtn.click();

        // Verify both commands were sent
        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send both desktop compound step commands', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['zerknij', 'ekwipunek']));
    });

    test('desktop compound macro with multiple command steps', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                buttons: [
                    {
                        id: 'desktop-btn-1',
                        label: 'MixCombo',
                        macroType: 'compound',
                        command: '',
                        color: '#6EB4DC',
                        fontColor: '#f1f5f9',
                        fontSize: 11,
                        width: 80,
                        height: 36,
                        x: 100,
                        y: 100,
                        backgroundOpacity: 0.85,
                        steps: [
                            { macroType: 'command', command: 'zerknij' },
                            { macroType: 'command', command: 'polnoc' },
                        ],
                    },
                ],
                locked: true,
            };
            localStorage.setItem('desktopButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);

        const desktopBtn = page.locator('#desktop-buttons-container .desktop-button').first();
        await expect(desktopBtn).toBeVisible();
        await desktopBtn.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send both command steps', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['zerknij', 'polnoc']));
    });

    test('desktop compound macro persists after reload', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                buttons: [
                    {
                        id: 'desktop-btn-1',
                        label: 'PersistCombo',
                        macroType: 'compound',
                        command: '',
                        color: '#6EB4DC',
                        fontColor: '#f1f5f9',
                        fontSize: 11,
                        width: 80,
                        height: 36,
                        x: 100,
                        y: 100,
                        backgroundOpacity: 0.85,
                        steps: [
                            { macroType: 'command', command: 'test_one' },
                            { macroType: 'command', command: 'test_two' },
                        ],
                    },
                ],
                locked: true,
            };
            localStorage.setItem('desktopButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Verify button is present
        const desktopBtn = page.locator('#desktop-buttons-container .desktop-button').first();
        await expect(desktopBtn).toBeVisible();
        await expect(desktopBtn).toHaveText('PersistCombo');

        // Reload
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Button should still exist after reload
        const desktopBtnReload = page.locator('#desktop-buttons-container .desktop-button').first();
        await expect(desktopBtnReload).toBeVisible();
        await expect(desktopBtnReload).toHaveText('PersistCombo');

        // Click and verify commands still work
        await resetCommandLog(page);
        await desktopBtnReload.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send compound commands after reload', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['test_one', 'test_two']));
    });

    test('desktop compound step selector excludes compound and empty options', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await openButtonsSettings(page);
        await switchToDesktopTab(page);

        await page.getByText('+ Dodaj przycisk').click();

        const macroSelect = page.locator('select').filter({ has: page.locator('option[value="compound"]') }).first();
        await macroSelect.selectOption('compound');

        await page.getByText('+ Dodaj krok').click();

        const stepContainers = page.locator('.border.rounded.mb-2.p-2');
        const stepSelect = stepContainers.first().locator('select').first();

        const options = await stepSelect.locator('option').allTextContents();
        expect(options, 'step options should not include compound').not.toContain(expect.stringContaining('wiele akcji'));
        expect(options, 'step options should not include empty').not.toContain('Pusty');
    });

    test('kierunek desktop button sends direction on click', async ({ page }) => {
        await page.addInitScript(() => {
            const settings = {
                buttons: [
                    {
                        id: 'desktop-btn-1',
                        label: 'North',
                        macroType: 'kierunek',
                        command: '',
                        direction: 'n',
                        color: '#6EB4DC',
                        fontColor: '#f1f5f9',
                        fontSize: 11,
                        width: 80,
                        height: 36,
                        x: 100,
                        y: 100,
                        backgroundOpacity: 0.85,
                    },
                ],
                locked: true,
            };
            localStorage.setItem('desktopButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);

        const desktopBtn = page.locator('#desktop-buttons-container .desktop-button').first();
        await expect(desktopBtn).toBeVisible();
        await desktopBtn.click();

        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send direction command from desktop button', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['n']));
    });

    test('plain command desktop button sends command on click', async ({ page }) => {
        // Pre-configure a desktop button with a plain command macro
        await page.addInitScript(() => {
            const settings = {
                buttons: [
                    {
                        id: 'desktop-btn-1',
                        label: 'TestCmd',
                        macroType: 'command',
                        command: 'zerknij',
                        color: '#6EB4DC',
                        fontColor: '#f1f5f9',
                        fontSize: 11,
                        width: 80,
                        height: 36,
                        x: 100,
                        y: 100,
                        backgroundOpacity: 0.85,
                    },
                ],
                locked: true,
            };
            localStorage.setItem('desktopButtonSettings', JSON.stringify(settings));
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);

        // Click the desktop button
        const desktopBtn = page.locator('#desktop-buttons-container .desktop-button').first();
        await expect(desktopBtn).toBeVisible();
        await desktopBtn.click();

        // Verify command was sent
        await expect.poll(
            async () => await getCommandLog(page),
            { message: 'should send plain command from desktop button', timeout: 5000 }
        ).toEqual(expect.arrayContaining(['zerknij']));
    });
});
