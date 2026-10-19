import {expect, test} from './support/fixtures';
import {ensureGameSocket, submitCommand, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

const toasts = (page: Page) => page.locator('#notification-center .toast');

async function open(page: Page, shellSettings?: Record<string, unknown>) {
    if (shellSettings) {
        await page.addInitScript((settings) => {
            localStorage.setItem('shellSettings', JSON.stringify(settings));
        }, shellSettings);
    }
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
}

test.describe('Notification center', () => {
    test('starts empty', async ({page}) => {
        await open(page);
        await expect(toasts(page)).toHaveCount(0);
    });

    test('renders a toast with its text', async ({page}) => {
        await open(page);
        await submitCommand(page, '/opoz 2');

        const toast = toasts(page);
        await expect(toast).toBeVisible();
        await expect(toast.locator('.toast__text')).toHaveText('Opóźnienie chodzenia: 2,00 s');
    });

    test('auto-removes after the default time', async ({page}) => {
        await open(page);
        await submitCommand(page, '/opoz 1');

        await expect(toasts(page)).toBeVisible();
        await expect(toasts(page)).toBeHidden({timeout: 6000});
    });

    test('repeats under one key merge into a counted toast', async ({page}) => {
        await open(page);
        await submitCommand(page, '/opoz 1');
        await submitCommand(page, '/szybciej');
        await submitCommand(page, '/wolniej');

        await expect(toasts(page)).toHaveCount(1);
        await expect(toasts(page).locator('.toast__text')).toHaveText('Opóźnienie chodzenia: 1,00 s');
        await expect(toasts(page).locator('.toast__count')).toHaveText('×3');
    });

    test('the close button dismisses a toast', async ({page}) => {
        await open(page);
        await submitCommand(page, '/opoz 2');

        await toasts(page).hover();
        await toasts(page).getByTitle('Zamknij').click();
        await expect(toasts(page)).toHaveCount(0);
    });

    test('hovering holds the toast on screen', async ({page}) => {
        await open(page, {toastDurationScale: 0.5});
        await submitCommand(page, '/opoz 2');

        await toasts(page).hover();
        await page.waitForTimeout(2500);
        await expect(toasts(page)).toBeVisible();

        await page.mouse.move(0, 0);
        await expect(toasts(page)).toBeHidden({timeout: 4000});
    });

    test('stacks in the corner picked in the settings', async ({page}) => {
        await open(page, {toastPosition: 'bottom-center'});
        await submitCommand(page, '/opoz 2');

        await expect(page.locator('#notification-center .toast-stack')).toHaveClass(/toast-stack--bottom-center/);
        const output = await page.locator('#main_text_output_msg_wrapper').boundingBox();
        const toast = await toasts(page).boundingBox();
        expect(output && toast).toBeTruthy();
        // Near the bottom edge of the visible output.
        expect(output!.y + output!.height - (toast!.y + toast!.height)).toBeLessThan(40);
    });

    test('a muted source shows nothing', async ({page}) => {
        await open(page, {toastMutedSources: ['walk']});
        await submitCommand(page, '/opoz 2');

        await page.waitForTimeout(300);
        await expect(toasts(page)).toHaveCount(0);
    });

    test('survives the output trimming its oldest lines', async ({page}) => {
        await page.addInitScript(() => {
            localStorage.setItem('uiSettings', JSON.stringify({outputMaxElements: 100}));
        });
        await open(page);
        await page.evaluate(() => {
            for (let i = 0; i < 260; i++) (window as any).__pushText(`linia ${i}`, 'comm');
        });
        await expect(page.locator('#main_text_output_msg_wrapper')).not.toContainText('linia 5');

        await submitCommand(page, '/opoz 2');
        await expect(toasts(page)).toBeVisible();
    });
});
