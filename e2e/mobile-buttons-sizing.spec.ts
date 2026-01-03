import { expect, test } from './support/fixtures';
import { ensureGameSocket, waitForCommandInput } from './support/mocks';
import { Page, Locator } from '@playwright/test';

const MENU_BUTTON = '#menu-button';
const MOBILE_BUTTONS_BUTTON = '#mobile-buttons-button';
const MOBILE_BUTTONS_MODAL = '#mobile-buttons-modal';
const MOBILE_BUTTONS_SAVE = '#mobile-buttons-save';

async function openMobileButtonsSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(MOBILE_BUTTONS_BUTTON);
    const modal = page.locator(MOBILE_BUTTONS_MODAL);
    await expect(modal, 'should open mobile buttons settings modal').toBeVisible();
    return modal;
}

function getSizeGapSection(modal: Locator) {
    // The size/gap section is the first .mobile-buttons-background-section in the modal
    return modal.locator('.mobile-buttons-background-section').first();
}

function getSizeSlider(modal: Locator) {
    return getSizeGapSection(modal).locator('input[type="range"]').first();
}

function getGapSlider(modal: Locator) {
    return getSizeGapSection(modal).locator('input[type="range"]').nth(1);
}

function getSizeResetButton(modal: Locator) {
    return modal.locator('[data-testid="reset-button-size"]');
}

function getGapResetButton(modal: Locator) {
    return modal.locator('[data-testid="reset-button-gap"]');
}

test.describe('Mobile buttons sizing and gap', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
    });

    test('should configure button size via slider', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openMobileButtonsSettings(page);

        // Find the size slider
        const sizeSlider = getSizeSlider(modal);
        await expect(sizeSlider, 'size slider should be visible').toBeVisible();

        // Get initial button size from preview
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });
        const button1 = soloPreview.locator('[data-button-id="button-1"]');

        const initialSize = await button1.evaluate((el) => el.style.width);
        expect(initialSize, 'initial button width should be 36px').toBe('36px');

        // Change size to 50px
        await sizeSlider.fill('50');

        // Verify the preview button size changed
        const newSize = await button1.evaluate((el) => el.style.width);
        expect(newSize, 'button width should be 50px after slider change').toBe('50px');

        // Save and close
        await page.locator(MOBILE_BUTTONS_SAVE).click();
        await expect(modal, 'modal should close after save').not.toBeVisible();

        // Verify actual buttons have the new size
        const mobileButtons = page.locator('#mobile-direction-buttons');
        const actualButton = mobileButtons.locator('#button-1');
        await expect(actualButton, 'actual button should be visible').toBeVisible();

        const actualSize = await actualButton.evaluate((el) => el.style.width);
        expect(actualSize, 'actual button width should be 50px').toBe('50px');
    });

    test('should configure button gap via slider', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openMobileButtonsSettings(page);

        // Find the gap slider
        const gapSlider = getGapSlider(modal);
        await expect(gapSlider, 'gap slider should be visible').toBeVisible();

        // Get the preview grid
        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        // Get initial gap
        const initialGap = await soloPreview.evaluate((el) => getComputedStyle(el).gap);
        expect(initialGap, 'initial gap should be 10px').toBe('10px');

        // Change gap to 15px
        await gapSlider.fill('15');

        // Verify the preview grid gap changed
        const newGap = await soloPreview.evaluate((el) => el.style.gap);
        expect(newGap, 'gap should be 15px after slider change').toBe('15px');

        // Save and close
        await page.locator(MOBILE_BUTTONS_SAVE).click();
        await expect(modal, 'modal should close after save').not.toBeVisible();

        // Verify actual buttons container has the new gap
        const mobileButtons = page.locator('#mobile-direction-buttons');
        await expect(mobileButtons, 'mobile buttons container should be visible').toBeVisible();

        const actualGap = await mobileButtons.evaluate((el) => el.style.gap);
        expect(actualGap, 'actual gap should be 15px').toBe('15px');
    });

    test('should persist button size and gap after reload', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openMobileButtonsSettings(page);

        // Set custom size and gap
        const sizeSlider = getSizeSlider(modal);
        const gapSlider = getGapSlider(modal);

        await sizeSlider.fill('60');
        await gapSlider.fill('5');

        // Save and close
        await page.locator(MOBILE_BUTTONS_SAVE).click();
        await expect(modal, 'modal should close after save').not.toBeVisible();

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Verify actual buttons have the saved size and gap
        const mobileButtons = page.locator('#mobile-direction-buttons');
        await expect(mobileButtons, 'mobile buttons container should be visible after reload').toBeVisible();

        const actualButton = mobileButtons.locator('.mobile-button').first();
        const actualSize = await actualButton.evaluate((el) => el.style.width);
        expect(actualSize, 'button width should still be 60px after reload').toBe('60px');

        const actualGap = await mobileButtons.evaluate((el) => el.style.gap);
        expect(actualGap, 'gap should still be 5px after reload').toBe('5px');

        // Open settings again and verify sliders show correct values
        const modalAfterReload = await openMobileButtonsSettings(page);
        const sizeSliderAfterReload = getSizeSlider(modalAfterReload);
        const gapSliderAfterReload = getGapSlider(modalAfterReload);

        const sizeValue = await sizeSliderAfterReload.inputValue();
        expect(sizeValue, 'size slider should show 60 after reload').toBe('60');

        const gapValue = await gapSliderAfterReload.inputValue();
        expect(gapValue, 'gap slider should show 5 after reload').toBe('5');
    });

    test('should reset size to default', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openMobileButtonsSettings(page);

        // Change size
        const sizeSlider = getSizeSlider(modal);
        await sizeSlider.fill('70');

        // Verify size changed
        let sizeValue = await sizeSlider.inputValue();
        expect(sizeValue, 'size should be 70 after change').toBe('70');

        // Find and click the reset button for size
        const resetButton = getSizeResetButton(modal);
        await expect(resetButton, 'reset button should be visible').toBeVisible();
        await resetButton.click();

        // Wait for React state to update
        await page.waitForFunction(() => {
            const slider = document.querySelector('.mobile-buttons-background-section input[type="range"]') as HTMLInputElement;
            return slider && slider.value === '36';
        }, { timeout: 5000 });

        // Verify size is reset to default (36)
        sizeValue = await sizeSlider.inputValue();
        expect(sizeValue, 'size should be reset to 36').toBe('36');
    });

    test('should reset gap to default', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openMobileButtonsSettings(page);

        // Change gap
        const gapSlider = getGapSlider(modal);
        await gapSlider.fill('18');

        // Verify gap changed
        let gapValue = await gapSlider.inputValue();
        expect(gapValue, 'gap should be 18 after change').toBe('18');

        // Find and click the reset button for gap
        const resetButton = getGapResetButton(modal);
        await expect(resetButton, 'reset button should be visible').toBeVisible();
        await resetButton.click();

        // Wait for React state to update
        await page.waitForFunction(() => {
            const sliders = document.querySelectorAll('.mobile-buttons-background-section input[type="range"]');
            const gapSlider = sliders[1] as HTMLInputElement;
            return gapSlider && gapSlider.value === '10';
        }, { timeout: 5000 });

        // Verify gap is reset to default (10)
        gapValue = await gapSlider.inputValue();
        expect(gapValue, 'gap should be reset to 10').toBe('10');
    });

    test('font size should scale with button size', async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openMobileButtonsSettings(page);

        const soloPreview = page.locator('#mobile-buttons-preview-solo:not(.d-none)');
        await soloPreview.locator('[data-button-id="button-1"]').waitFor({ timeout: 5000 });

        // Get a text button (not direction button)
        const textButton = soloPreview.locator('[data-button-id="button-1"]');

        // Change size to 60px
        const sizeSlider = getSizeSlider(modal);
        await sizeSlider.fill('60');

        // Verify font size scales (60 * 0.20 = 12px for text buttons)
        const fontSize = await textButton.evaluate((el) => el.style.fontSize);
        expect(fontSize, 'font size should scale with button size').toBe('12px');

        // Change to smaller size (30px)
        await sizeSlider.fill('30');

        // Verify font size scales (30 * 0.20 = 6px, but min is 6px)
        const smallFontSize = await textButton.evaluate((el) => el.style.fontSize);
        expect(smallFontSize, 'font size should have minimum of 6px').toBe('6px');
    });
});
