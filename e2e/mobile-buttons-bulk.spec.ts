import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { waitForCommandInput } from './support/mocks';
import { openSettings, SETTINGS_SAVE } from './support/settings';

async function pickTool(modal: ReturnType<Page['locator']>, name: string) {
    await modal.locator('.mobile-buttons-tools .popup-segmented').getByText(name, { exact: true }).click();
}

test.describe('Mobile buttons: Zaznacz and Style tools', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto('/');
        await waitForCommandInput(page);
    });

    test('Zaznacz gives every direction the top-row style at once', async ({ page }) => {
        const modal = await openSettings(page, 'ui-mobile-buttons');
        const preview = modal.locator('#mobile-buttons-preview-solo');
        await pickTool(modal, 'Zaznacz');

        await modal.locator('.mobile-buttons-select-panel').getByRole('button', { name: 'Wszystkie kierunki' }).click();
        await expect(modal.locator('.mobile-buttons-select-panel__header')).toContainText('Zaznaczono');
        await expect(preview.locator('[data-button-id="n-button"]')).toHaveClass(/checked/);
        await expect(preview.locator('[data-button-id="button-1"]')).not.toHaveClass(/checked/);

        const topRowColor = await preview.locator('[data-button-id="button-1"]').evaluate(el => getComputedStyle(el).backgroundColor);
        const assign = modal.locator('.mobile-buttons-select-panel .mobile-button-config-section', { hasText: 'Nadaj styl' });
        await assign.getByRole('button', { name: 'Podstawowy' }).click();

        await expect(modal.locator('.mobile-buttons-notice')).toContainText('Styl „Podstawowy”');
        await expect(preview.locator('[data-button-id="n-button"]')).toHaveCSS('background-color', topRowColor);
        await expect(preview.locator('[data-button-id="special-exit-button"]')).toHaveCSS('background-color', topRowColor);

        await page.locator(SETTINGS_SAVE).click();
        await expect(modal).not.toBeVisible();
        await expect(page.locator('#mobile-direction-buttons [data-button-id="n-button"]')).toHaveCSS('background-color', topRowColor);
    });

    test('Ctrl+click in Edytuj starts a selection, and a style change in Drużyna overrides only there', async ({ page }) => {
        const modal = await openSettings(page, 'ui-mobile-buttons');
        await modal.locator('.dialog-tab', { hasText: 'Drużyna' }).click();
        const team = modal.locator('#mobile-buttons-preview-team');

        await team.locator('[data-button-id="button-1"]').click();
        await team.locator('[data-button-id="button-2"]').click({ modifiers: ['Control'] });

        await expect(modal.locator('.mobile-buttons-select-panel__header')).toContainText('Zaznaczono 2');
        await expect(team.locator('[data-button-id="button-1"]')).toHaveClass(/checked/);
        await expect(team.locator('[data-button-id="button-2"]')).toHaveClass(/checked/);

        const assign = modal.locator('.mobile-buttons-select-panel .mobile-button-config-section', { hasText: 'Nadaj styl' });
        await assign.getByRole('button', { name: 'Kierunki' }).click();

        await expect(modal.locator('.mobile-buttons-notice')).toContainText('2 nadpisane w trybie Drużyna');
        await expect(modal.locator('.dialog-tab', { hasText: 'Drużyna' }).locator('.dialog-tab__count')).toHaveText('2');

        await modal.locator('.mobile-buttons-select-panel').getByRole('button', { name: 'Przywróć dziedziczone' }).click();
        await expect(modal.locator('.mobile-buttons-notice')).toHaveText('Przywrócono 2 przyciski z Solo');
        await expect(modal.locator('.dialog-tab', { hasText: 'Drużyna' }).locator('.dialog-tab__count')).toHaveCount(0);
    });

    test('Style tool recolours a style everywhere, assigns it by clicking, and deletes it', async ({ page }) => {
        const modal = await openSettings(page, 'ui-mobile-buttons');
        const solo = modal.locator('#mobile-buttons-preview-solo');
        await pickTool(modal, 'Style');

        const directions = modal.locator('.mobile-buttons-style-card', { hasText: 'Kierunki' });
        await directions.locator('.mobile-buttons-style-card__head').click();
        await expect(solo.locator('[data-button-id="n-button"]')).toHaveClass(/style-hit/);
        await directions.locator('.mobile-button-color-row', { hasText: 'Tło' }).locator('input[type="color"]').fill('#ff0000');

        await expect(solo.locator('[data-button-id="n-button"]')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
        await modal.locator('.dialog-tab', { hasText: 'Prowadzący' }).click();
        await expect(modal.locator('#mobile-buttons-preview-leader [data-button-id="s-button"]')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
        await modal.locator('.dialog-tab', { hasText: 'Solo' }).click();

        await modal.locator('.mobile-buttons-styles-panel').getByRole('button', { name: '+ Nowy styl' }).click();
        await expect(modal.locator('.mobile-buttons-style-card.is-open')).toContainText('Styl 3');
        await solo.locator('[data-button-id="button-3"]').click();
        await expect(modal.locator('.mobile-buttons-notice')).toHaveText('Styl „Styl 3”: 1 przycisk');
        await expect(solo.locator('[data-button-id="button-3"]')).toHaveCSS('background-color', 'rgb(75, 127, 82)');

        await modal.locator('.mobile-buttons-style-card.is-open').getByTitle(/Usuń styl/).click();
        await expect(modal.locator('.mobile-buttons-notice')).toContainText('Usunięto styl „Styl 3”');
        await expect(modal.locator('.mobile-buttons-style-card')).toHaveCount(2);
        await expect(solo.locator('[data-button-id="button-3"]')).not.toHaveCSS('background-color', 'rgb(75, 127, 82)');
    });

    test('the tool switch stays in place whatever the hint under it says', async ({ page }) => {
        const modal = await openSettings(page, 'ui-mobile-buttons');
        const segmented = modal.locator('.mobile-buttons-tools .popup-segmented');
        const positions = new Set<number>();
        for (const name of ['Edytuj', 'Zaznacz', 'Style', 'Układ']) {
            await pickTool(modal, name);
            positions.add(Math.round((await segmented.boundingBox())!.x));
        }
        expect(positions.size).toBe(1);
    });
});
