import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';
import type {Page} from '@playwright/test';

const SELECT = '#ui-trigger-prefilter';

async function pushLines(page: Page, lines: string[]) {
    await page.evaluate((text) => (window as any).__pushIncoming(text), lines.join('\n') + '\n');
}

test.describe('Trigger prefilter setting', () => {
    test('is on by default and a changed mode survives a reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        let modal = await openSettings(page, 'ui-other');
        await expect(modal.locator(SELECT), 'should default to on').toHaveValue('on');
        await modal.locator(SELECT).selectOption('verify');
        await saveSettings(page);

        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('behaviorSettings') ?? '{}'));
        expect(stored.triggerPrefilter, 'should store the mode in the behaviour settings').toBe('verify');

        await page.reload();
        await waitForCommandInput(page);
        modal = await openSettings(page, 'ui-other');
        await expect(modal.locator(SELECT), 'should keep verify after a reload').toHaveValue('verify');
    });

    test('verify mode keeps output flowing and reports no misses for game lines', async ({page}) => {
        const misses: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error' && msg.text().includes('PREFILTER MISS')) misses.push(msg.text());
        });

        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openSettings(page, 'ui-other');
        await modal.locator(SELECT).selectOption('verify');
        await saveSettings(page);

        await pushLines(page, [
            'Rudy ork atakuje cie!',
            'Krasnolud mowi do ciebie: Niech cie gory strzega.',
            'Znajdujesz trzy srebrne monety.',
            'Linia kontrolna prefiltra 4217.',
        ]);

        await expect(page.locator('#main_text_output_msg_wrapper'), 'should still render the lines')
            .toContainText('Linia kontrolna prefiltra 4217.');
        expect(misses, 'should not report any prefilter miss').toEqual([]);
    });
});
