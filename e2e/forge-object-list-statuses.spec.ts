import { expect, test } from './support/fixtures';
import type { Page } from '@playwright/test';

// forge-ui's command line is #alt-input (a textarea), not the stock #message-input.
async function submitForgeCommand(page: Page, command: string): Promise<void> {
    const input = page.locator('#alt-input');
    await input.waitFor({ state: 'visible' });
    await input.focus();
    await input.fill(command);
    await input.press('Enter');
    await page.waitForTimeout(5);
}

/**
 * The enemy-status filter (ogluch / przelamana obrona) and the gold next-target
 * mark are UI-agnostic: they live in the shared client bootstrap and the shared
 * objectListFilters registry, so the forge HUD must render them exactly like the
 * stock UI. The filter used to be registered only in src/web/main.ts, which left
 * ogluch dead in forge — hence this spec.
 */
test.describe('forge object list statuses', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/forge-ui/');
        await page.locator('.gate__close').click();
        // No game socket needed: the alias runs client-side and the demo popup
        // pushes its own char.info / objects payloads onto the event bus.
        await submitForgeCommand(page, '/demo_kondycje');
        await expect(page.locator('.object-list-demo-popup')).toBeVisible();
    });

    test('ogluch washes the row in the forge HUD', async ({ page }) => {
        // "Goblin szaman" (203) starts ogluszony in the demo defaults. forge tints
        // the row rather than painting the filter's flat white slab on the name.
        const row = page.locator('.obj[data-object-id="203"]');
        await expect(row).toHaveClass(/obj--marked/);
        const name = row.locator('.obj__name');
        await expect(name).toHaveText('Goblin szaman');
        await expect(name).not.toHaveCSS('background-color', 'rgb(255, 255, 255)');
        await expect(name).not.toHaveCSS('color', 'rgb(0, 0, 0)');
    });

    test('gold next-target mark shows in the forge HUD', async ({ page }) => {
        // "Goblin lucznik" (202) heads the attack queue in the demo defaults.
        await expect(page.locator('.obj[data-object-id="202"]')).toHaveClass(/obj--next-queued/);
        await expect(page.locator('.obj[data-object-id="202"] .obj__key'))
            .toHaveClass(/next-target/);
        await expect(page.locator('.obj[data-object-id="201"] .obj__key'))
            .not.toHaveClass(/next-target/);
    });
});
