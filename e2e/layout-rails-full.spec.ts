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

async function setToggle(page: Page, id: string, on: boolean): Promise<void> {
  const toggle = page.locator(id);
  if ((await toggle.isChecked()) !== on) await toggle.click();
}

async function setLayout(page: Page, railsFull: boolean): Promise<void> {
  await openSettings(page, 'ui-windows');
  await setToggle(page, '#ui-layout-manager-enabled', true);
  await page.locator('label', { has: page.locator(railsFull ? '#ui-layout-arrangement-tall' : '#ui-layout-arrangement-wide') }).click();
  await page.click(SETTINGS_SAVE);
  await page.waitForSelector('#settings-modal:not([hidden])', { state: 'hidden', timeout: 5000 });
  await page.waitForFunction(() => document.body.classList.contains('layout-manager-enabled'));
}

/** The right dock's vertical extent and the command line's right edge. */
async function measure(page: Page) {
  const dock = (await page.locator('.dock-zone--right').boundingBox())!;
  const input = (await page.locator('#input-area').boundingBox())!;
  const output = (await page.locator('#content-area').boundingBox())!;
  return {
    outputTop: output.y,
    dockTop: dock.y,
    dockBottom: dock.y + dock.height,
    dockLeft: dock.x,
    inputRight: input.x + input.width,
    inputBottom: input.y + input.height,
  };
}

test.describe('Full-height side docks', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('side docks span the full height when switched on, and it persists', async ({ page }) => {
    await setLayout(page, false);
    await expect(page.locator('body.layout-rails-vertical')).not.toBeAttached();
    await expect(page.locator('.dock-zone--right')).toBeVisible();
    // Default: the right dock stops above the command line, which spans the width.
    const before = await measure(page);
    expect(before.dockBottom).toBeLessThanOrEqual(before.inputBottom - 1);
    expect(before.inputRight).toBeGreaterThan(before.dockLeft);

    await setLayout(page, true);
    await expect(page.locator('body.layout-rails-vertical')).toBeAttached();
    await expect(page.locator('#layout-right-dock-host > .dock-zone--right')).toBeAttached();
    const viewport = page.viewportSize()!;
    const after = await measure(page);
    expect(after.dockTop).toBeLessThanOrEqual(after.outputTop);
    expect(after.dockBottom).toBeGreaterThanOrEqual(viewport.height - 1);
    // The command line now sits between the rails.
    expect(after.inputRight).toBeLessThanOrEqual(after.dockLeft + 1);

    await waitForLayoutSaved(page);
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await expect(page.locator('body.layout-rails-vertical')).toBeAttached();

    await openSettings(page, 'ui-windows');
    await expect(page.locator('#ui-layout-arrangement-tall')).toBeChecked();
  });
});
