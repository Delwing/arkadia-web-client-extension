import {expect, test} from './support/fixtures';
import {ensureGameSocket, resetCommandLog, waitForCommandInput} from './support/mocks';
import {openSettings, saveSettings} from './support/settings';
import type {Page} from '@playwright/test';

const SELECT = '#ui-ping-interval';

/** Latency pings that went over the wire since the last reset. */
async function countPings(page: Page): Promise<number> {
    return await page.evaluate(() => {
        const sockets: any[] = (window as any).__mockSockets ?? [];
        let count = 0;
        for (const socket of sockets) {
            for (const frame of (socket?.sent ?? [])) {
                let decoded = '';
                try {
                    decoded = atob(frame);
                } catch {
                    continue;
                }
                if (decoded.includes('core.ping')) count += 1;
            }
        }
        return count;
    });
}

test.describe('Ping interval setting', () => {
    test('pings every few seconds by default and stops once turned off', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await resetCommandLog(page);
        await expect.poll(() => countPings(page), {message: 'should keep pinging by default', timeout: 8000})
            .toBeGreaterThan(0);

        const modal = await openSettings(page, 'ui-other');
        await expect(modal.locator(SELECT), 'should default to every 3 s').toHaveValue('3');
        await modal.locator(SELECT).selectOption('0');
        await saveSettings(page);

        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('uiSettings') ?? '{}'));
        expect(stored.pingInterval, 'should store the choice per device').toBe(0);

        await resetCommandLog(page);
        await page.waitForTimeout(4000);
        expect(await countPings(page), 'should send no pings on the live connection').toBe(0);
    });
});
