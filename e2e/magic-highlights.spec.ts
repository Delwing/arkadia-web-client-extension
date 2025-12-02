import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput} from './support/mocks';

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
});
