import {expect, test} from './support/fixtures';
import {waitForCommandInput, waitForMapReady} from './support/mocks';

test.describe('Map loading', () => {
    test('should render map and hide loading progress after initialization', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);

        const progressContainer = page.locator('#map-progress-container');
        const mapCanvas = page.locator('#map canvas').first();

        await waitForMapReady(page);

        await expect(mapCanvas, 'should show rendered map canvas after loading').toBeVisible();
        await expect(progressContainer, 'should hide map loading progress once map is ready').toBeHidden({ timeout: 10000 });
    });
});
