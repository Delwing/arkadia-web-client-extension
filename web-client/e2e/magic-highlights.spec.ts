import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {ensureGameSocket, pushText, waitForClientReady} from './support/mocks';

async function waitForTokenTrigger(page: Page, tag: string): Promise<void> {
    await page.waitForFunction((expectedTag) => {
        const client: any = (globalThis as any).clientExtension;
        const triggers: any = client?.Triggers;
        const tokenTriggers: any = triggers?.tokenTriggers;
        if (!tokenTriggers || typeof tokenTriggers.values !== 'function') {
            return false;
        }
        for (const bucket of Array.from(tokenTriggers.values())) {
            if (Array.isArray(bucket) && bucket.some((entry) => entry?.trigger?.tag === expectedTag)) {
                return true;
            }
        }
        return false;
    }, tag);
}

test.describe('Magic and key highlights', () => {
    test('colors magic items using configured palette', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);
        await waitForTokenTrigger(page, 'magics');

        await pushText(page, 'Na ziemi lezy magiczny miecz.');

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output, 'should display magic item text in output').toContainText('magiczny miecz');

        const magicSpan = output.locator('span', { hasText: 'magiczny miecz' }).last();
        await expect(magicSpan, 'should style magic item text using configured palette').toHaveCSS(
            'color',
            'rgb(223, 95, 95)'
        );
    });

    test('colors magic keys using configured palette', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);
        await waitForTokenTrigger(page, 'magicKeys');

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
