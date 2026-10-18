import { expect, test } from './support/fixtures';
import { waitForCommandInput } from './support/mocks';
import { openSettings, SETTINGS_SAVE } from './support/settings';

test.describe('Mobile buttons: Solo base with Drużyna and Prowadzący inheriting', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto('/');
        await waitForCommandInput(page);
    });

    test('a change in Solo shows, dimmed, in the modes that inherit it', async ({ page }) => {
        const modal = await openSettings(page, 'ui-mobile-buttons');
        await modal.locator('#mobile-buttons-preview-solo [data-button-id="button-2"]').click();
        await modal.locator('.mobile-button-config .mobile-button-label').fill('cel');

        await modal.locator('.dialog-tab', { hasText: 'Drużyna' }).click();

        const inherited = modal.locator('#mobile-buttons-preview-team [data-button-id="button-2"]');
        await expect(inherited).toHaveText('cel');
        await expect(inherited).toHaveClass(/inherited/);
        await expect(modal.locator('.mobile-button-origin')).toContainText('Dziedziczony z Solo');
    });

    test('editing in Drużyna overrides only there, and Przywróć brings the inherited one back', async ({ page }) => {
        const modal = await openSettings(page, 'ui-mobile-buttons');
        await modal.locator('.dialog-tab', { hasText: 'Drużyna' }).click();
        const teamButton = modal.locator('#mobile-buttons-preview-team [data-button-id="button-2"]');
        await teamButton.click();
        await modal.locator('.mobile-button-config .mobile-button-label').fill('atak');

        await expect(modal.locator('.mobile-buttons-notice')).toHaveText('Nadpisano przycisk w trybie Drużyna');
        await expect(teamButton).toHaveClass(/own/);
        await expect(modal.locator('.dialog-tab', { hasText: 'Drużyna' }).locator('.dialog-tab__count')).toHaveText('1');

        await modal.locator('.dialog-tab', { hasText: 'Prowadzący' }).click();
        await expect(modal.locator('#mobile-buttons-preview-leader [data-button-id="button-2"]')).toHaveText('atak');

        await modal.locator('.dialog-tab', { hasText: 'Solo' }).click();
        await expect(modal.locator('#mobile-buttons-preview-solo [data-button-id="button-2"]')).toHaveText('/z cel');

        await page.locator(SETTINGS_SAVE).click();
        await expect(modal).not.toBeVisible();

        const reopened = await openSettings(page, 'ui-mobile-buttons');
        await reopened.locator('.dialog-tab', { hasText: 'Drużyna' }).click();
        await reopened.locator('#mobile-buttons-preview-team [data-button-id="button-2"]').click();
        await reopened.locator('.mobile-button-origin').getByRole('button', { name: 'Przywróć' }).click();

        await expect(reopened.locator('#mobile-buttons-preview-team [data-button-id="button-2"]')).toHaveText('/z cel');
        await expect(reopened.locator('.dialog-tab', { hasText: 'Drużyna' }).locator('.dialog-tab__count')).toHaveCount(0);
    });

    test('Prowadzący can get a grid of its own without changing Drużyna', async ({ page }) => {
        const modal = await openSettings(page, 'ui-mobile-buttons');
        await modal.locator('.dialog-tab', { hasText: 'Prowadzący' }).click();
        await modal.locator('.mobile-buttons-stage .popup-segmented').getByText('Układ', { exact: true }).click();

        await modal.getByTitle('Dodaj kolumnę z prawej').click();

        await expect(modal.locator('.mobile-buttons-notice')).toHaveText('Utworzono własny układ dla trybu Prowadzący');
        await expect(modal.locator('.mobile-buttons-chain__summary')).toContainText('układ własny 5×5');
        await expect(modal.locator('#mobile-buttons-preview-leader .mobile-button')).toHaveCount(25);

        await modal.locator('.dialog-tab', { hasText: 'Drużyna' }).click();
        await expect(modal.locator('#mobile-buttons-preview-team .mobile-button')).toHaveCount(20);
        await expect(modal.locator('.mobile-buttons-chain__summary')).toContainText('układ z Solo');
    });
});
