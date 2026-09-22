import type {Locator, Page} from '@playwright/test';
import {expect} from './fixtures';

/**
 * Helpers for the Klawisze window (src/web/keys/Keys.tsx, `#binds-modal`).
 * Changes are stored as they are made; there is no Zapisz.
 */

export async function openKeysWindow(page: Page): Promise<void> {
    await page.click('#menu-button');
    await page.click('#binds-button');
    await page.waitForSelector('#binds-modal:not([hidden])', {timeout: 5000});
    await page.waitForSelector('#binds-keymap-select', {timeout: 5000});
}

export async function closeKeysWindow(page: Page): Promise<void> {
    await page.locator('#binds-modal .app-modal__close').first().click();
    await page.waitForSelector('#binds-modal:not([hidden])', {state: 'hidden', timeout: 5000});
}

/** Opens the ⋯ menu; its items carry their label as `title`. */
export async function openKeysMenu(page: Page): Promise<void> {
    await page.locator('#binds-modal button[title="Więcej"]').click();
}

/**
 * A binding's key in the lists, by entry id: `slot:lamp`, `slot:directions.n`,
 * `slot:temp[0]`, `custom:0`.
 */
export function bindKey(page: Page, entryId: string): Locator {
    return page.locator(`#binds-modal .keys-section [data-entry="${entryId}"]`);
}

/** Clicks a binding's key and presses `key` for it. */
export async function captureKey(page: Page, entryId: string, key: string): Promise<void> {
    const kc = bindKey(page, entryId);
    await kc.click();
    await expect(kc).toHaveText('naciśnij…');
    await page.keyboard.press(key);
}
