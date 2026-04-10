import {expect, test} from './support/fixtures';
import {ensureGameSocket, primeCharInfo, pushText, waitForCommandInput} from './support/mocks';
import type {Page} from '@playwright/test';

const MENU_BUTTON = '#menu-button';
const OPTIONS_BUTTON = '#options-button';
const OPTIONS_MODAL = '#options-modal';
const OPTIONS_SAVE_BUTTON = '#options-save';

async function openOptions(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(OPTIONS_BUTTON);
    const modal = page.locator(OPTIONS_MODAL);
    await expect(modal).toBeVisible();
    return modal;
}

async function saveOptions(page: Page) {
    await page.click(OPTIONS_SAVE_BUTTON);
    await expect(page.locator(OPTIONS_MODAL)).not.toBeVisible();
}

test.describe('Magic and key highlights', () => {
    test('colors magic items using configured palette', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushText(page, 'Na ziemi lezy magiczny miecz.');

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output, 'should display magic item text in output').toContainText('magiczny miecz');

        const magicSpan = output.locator('span', { hasText: 'magiczny miecz' }).last();
        await expect(magicSpan, 'should style magic item text using configured palette').toHaveCSS(
            'color',
            'rgb(215, 95, 95)'
        );
    });

    test('colors magic keys using configured palette', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await pushText(page, 'Sekretny klucz lezy tutaj.');

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output, 'should display magic key text in output').toContainText('Sekretny klucz');

        const keySpan = output.locator('span', { hasText: 'Sekretny klucz' }).last();
        await expect(keySpan, 'should style magic key text using configured palette').toHaveCSS(
            'color',
            'rgb(0, 255, 135)'
        );
    });

    test('applies custom magics color from settings', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'ColorHero'});
        await page.waitForFunction(() => localStorage.getItem('currentCharacter') === 'ColorHero');

        const modal = await openOptions(page);
        await modal.getByRole('button', {name: 'Magiki'}).click();
        await modal.locator('#magics-color').evaluate((el: HTMLInputElement) => {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
            nativeInputValueSetter.call(el, '#ff0000');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await saveOptions(page);

        await pushText(page, 'Na ziemi lezy magiczny miecz.');

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output, 'should display magic item text in output').toContainText('magiczny miecz');

        const magicSpan = output.locator('span', { hasText: 'magiczny miecz' }).last();
        await expect(magicSpan, 'should apply custom magics color').toHaveCSS('color', 'rgb(255, 0, 0)');
    });

    test('applies custom magic keys color from settings', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await primeCharInfo(page, {name: 'KeyColorHero'});
        await page.waitForFunction(() => localStorage.getItem('currentCharacter') === 'KeyColorHero');

        const modal = await openOptions(page);
        await modal.getByRole('button', {name: 'Magiki'}).click();
        await modal.locator('#magic-keys-color').evaluate((el: HTMLInputElement) => {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
            nativeInputValueSetter.call(el, '#0000ff');
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await saveOptions(page);

        await pushText(page, 'Sekretny klucz lezy tutaj.');

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output, 'should display magic key text in output').toContainText('Sekretny klucz');

        const keySpan = output.locator('span', { hasText: 'Sekretny klucz' }).last();
        await expect(keySpan, 'should apply custom magic keys color').toHaveCSS('color', 'rgb(0, 0, 255)');
    });
});
