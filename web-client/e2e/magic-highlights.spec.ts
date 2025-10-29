import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    installMockWebSocket,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockPeopleDownload,
    mockNpcDownload,
    pushText,
    waitForClientReady,
} from './support/mocks';

async function waitForTokenTrigger(page: Page, tag: string): Promise<void> {
    await page.waitForFunction((expectedTag) => {
        const client: any = (window as any).clientExtension;
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

test.beforeEach(async ({context}) => {
    await mockMagicsDownload(context);
    await mockMagicKeysDownload(context);
    await mockNpcDownload(context);
    await mockPeopleDownload(context);
    await installMockWebSocket(context);
});

test.describe('Magic and key highlights', () => {
    test('colors magic items using configured palette', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);
        await waitForTokenTrigger(page, 'magics');

        await pushText(page, 'Na ziemi lezy magiczny miecz.');

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output).toContainText('magiczny miecz');

        const magicSpan = output.locator('span', { hasText: 'magiczny miecz' }).last();
        await expect(magicSpan).toHaveCSS('color', 'rgb(223, 95, 95)');
    });

    test('colors magic keys using configured palette', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);
        await waitForTokenTrigger(page, 'magicKeys');

        await pushText(page, 'Sekretny klucz lezy tutaj.');

        const output = page.locator('#main_text_output_msg_wrapper');
        await expect(output).toContainText('Sekretny klucz');

        const keySpan = output.locator('span', { hasText: 'Sekretny klucz' }).last();
        await expect(keySpan).toHaveCSS('color', 'rgb(0, 255, 135)');
    });
});
