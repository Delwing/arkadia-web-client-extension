import type {Locator, Page} from '@playwright/test';
import {expect} from './fixtures';

/** Opens Automatyzacja from the main menu. */
export async function openAutomation(page: Page): Promise<Locator> {
    await page.click('#menu-button');
    await page.click('#automation-button');
    const modal = page.locator('#automation-modal');
    await expect(modal, 'should display the Automatyzacja window').toBeVisible();
    return modal;
}

export async function closeAutomation(modal: Locator): Promise<void> {
    await modal.locator('.app-modal__close').first().click();
    await expect(modal, 'should close the Automatyzacja window').not.toBeVisible();
}

/** Starts a new alias or trigger through the + button. */
export async function startNew(page: Page, modal: Locator, kind: 'alias' | 'trigger'): Promise<void> {
    await modal.getByTitle('Dodaj', {exact: true}).click();
    await page.getByRole('button', {name: kind === 'alias' ? /^Alias - / : /^Wyzwalacz - /}).click();
}

/** The list row showing `text` (a pattern, a name). */
export function row(modal: Locator, text: string): Locator {
    return modal.locator('.automation-item', {hasText: text});
}

export async function selectRow(modal: Locator, text: string): Promise<void> {
    await row(modal, text).locator('.automation-item__main').click();
}

export async function saveEditor(modal: Locator): Promise<void> {
    await modal.locator('.automation-editor__foot').getByRole('button', {name: 'Zapisz', exact: true}).click();
    await expect(modal.locator('.automation-error'), 'should save without a validation error').toHaveCount(0);
    await expect(modal.locator('.automation-list .automation-dot'), 'should leave nothing unsaved').toHaveCount(0);
}

/** Adds an alias that sends one command. */
export async function addAlias(page: Page, modal: Locator, pattern: string, command: string): Promise<void> {
    await startNew(page, modal, 'alias');
    await modal.getByPlaceholder('np. zab (.+)').fill(pattern);
    await modal.getByPlaceholder('np. zabij $1').fill(command);
    await saveEditor(modal);
}

/** Adds a pattern trigger whose single action is chosen and filled by `fillAction`. */
export async function addPatternTrigger(
    page: Page,
    modal: Locator,
    pattern: string,
    fillAction: (action: Locator) => Promise<void>,
): Promise<void> {
    await startNew(page, modal, 'trigger');
    await modal.getByTitle('Wzorzec', {exact: true}).fill(pattern);
    await modal.getByRole('button', {name: 'Dodaj akcję'}).click();
    await fillAction(modal.locator('.automation-act').last());
    await saveEditor(modal);
}
