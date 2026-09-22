import { expect, test } from './support/fixtures';
import { ensureGameSocket, pushGmcp, waitForCharacter, waitForCommandInput, waitForLayoutSaved } from './support/mocks';
import type { Page } from '@playwright/test';
import { openSettings, SETTINGS_SAVE } from './support/settings';

async function login(page: Page): Promise<void> {
  await page.goto('/');
  await waitForCommandInput(page);
  await ensureGameSocket(page);
  await pushGmcp(page, 'char.info', { name: 'TestChar', object_num: 12345 });
  await waitForCharacter(page, 'TestChar');
}

async function openUiSettingsModal(page: Page): Promise<void> {
  await openSettings(page, 'ui-windows');
}

async function closeUiSettingsModal(page: Page): Promise<void> {
  await page.click(SETTINGS_SAVE);
  await page.waitForSelector('#settings-modal:not([hidden])', { state: 'hidden', timeout: 5000 });
}

async function enableLayoutManager(page: Page): Promise<void> {
  await openUiSettingsModal(page);
  const toggle = page.locator('#ui-layout-manager-enabled');
  if (!(await toggle.isChecked())) await toggle.click();
  await closeUiSettingsModal(page);
  await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
}

// Count of nested row-direction splits inside the right dock — proves the leaf
// was wrapped in a perpendicular split (the default root is a 'col' split).
function rowSplitCount(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelectorAll('.dock-area-right [data-split-dir="row"]').length
  );
}

test.describe('Nested dock splits', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await enableLayoutManager(page);
  });

  test('default layout renders as a recursive tree on the right dock', async ({ page }) => {
    const right = page.locator('.dock-area-right');
    await expect(right.locator(':scope > .layout-split')).toBeVisible();
    // map + object list = two leaves stacked in a col root.
    await expect(right.locator('[data-leaf-id]')).toHaveCount(2);
    await expect(right.locator('.docked-panel--map')).toBeVisible();
  });

  test('split menu creates a nested split + empty placeholder, and persists', async ({ page }) => {
    const mapTitlebar = page.locator('.docked-panel--map .docked-panel-titlebar');
    await expect(mapTitlebar).toBeVisible();
    expect(await rowSplitCount(page)).toBe(0);

    // Right-click the map titlebar → split it to the right (perpendicular wrap).
    await mapTitlebar.click({ button: 'right' });
    const menu = page.locator('.layout-split-menu');
    await expect(menu).toBeVisible();
    await menu.getByText('Podziel w prawo').click();

    // A nested row split now exists, holding map + an empty placeholder cell.
    await expect.poll(() => rowSplitCount(page)).toBe(1);
    await expect(page.locator('.dock-area-right .layout-leaf--placeholder')).toHaveCount(1);

    // Wait for the debounced layout save, then reload — nesting must persist.
    await waitForLayoutSaved(page);
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);

    await expect(page.locator('body.layout-manager-enabled')).toBeAttached();
    await expect.poll(() => rowSplitCount(page)).toBe(1);
    await expect(page.locator('.dock-area-right .layout-leaf--placeholder')).toHaveCount(1);
  });

  test('removing the placeholder collapses the nested split', async ({ page }) => {
    const mapTitlebar = page.locator('.docked-panel--map .docked-panel-titlebar');
    await mapTitlebar.click({ button: 'right' });
    await page.locator('.layout-split-menu').getByText('Podziel w prawo').click();
    await expect.poll(() => rowSplitCount(page)).toBe(1);

    // Close the placeholder cell — the wrapper split normalizes away.
    await page.locator('.layout-leaf--placeholder .layout-placeholder__close').click();
    await expect.poll(() => rowSplitCount(page)).toBe(0);
    await expect(page.locator('.dock-area-right [data-leaf-id]')).toHaveCount(2);
  });
});
