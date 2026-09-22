import {expect, test} from './support/fixtures';
import {ensureGameSocket, waitForCommandInput} from './support/mocks';
import {bindKey, captureKey, closeKeysWindow, openKeysWindow} from './support/keys';

/** The one control: where the selected binding works. */
const reach = (page: import('@playwright/test').Page) =>
    page.locator('#binds-modal .keys-aside .keys-reach');

test.describe('Klawisze window', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
    });

    test('an own shortcut on a taken key shows as a conflict and moves to a suggested free key', async ({page}) => {
        await openKeysWindow(page);
        const modal = page.locator('#binds-modal');

        await modal.locator('[data-section="own"] .keys-add').filter({hasText: /^Komenda$/}).click();
        await modal.locator('[data-section="own"] .keys-command').fill('zaslon sie');
        await captureKey(page, 'custom:0', 'F5');

        // Tymczasowe 2 sits on F5 too: the key on the drawing counts both.
        const f5 = modal.locator('.keys-key[data-code="F5"]');
        await expect(f5).toHaveClass(/is-conflict/);
        await expect(f5).toContainText('2 bindy');

        await f5.click();
        const aside = modal.locator('.keys-aside');
        await expect(aside).toContainText('konflikt');
        await aside.locator('.keys-detail__keys .keys-kc', {hasText: /^F6$/}).click();

        await expect(bindKey(page, 'custom:0')).toHaveText('F6');
        await expect(f5).not.toHaveClass(/is-conflict/);

        // Stored as it was made — no Zapisz, and it survives reopening.
        await closeKeysWindow(page);
        await openKeysWindow(page);
        await expect(bindKey(page, 'custom:0')).toHaveText('F6');
        await expect(modal.locator('[data-section="own"] .keys-command')).toHaveValue('zaslon sie');
        await closeKeysWindow(page);
    });

    test('a key the browser keeps takes a command, listed as an own shortcut heard by the helper', async ({page}) => {
        await openKeysWindow(page);
        const modal = page.locator('#binds-modal');

        await modal.locator('.popup-segmented__item', {hasText: /^Ctrl/}).first().click();
        const ctrlW = modal.locator('.keys-key[data-code="KeyW"]');
        await expect(ctrlW).toHaveClass(/is-reserved/);

        // Assigning it makes a row on that key straight away — no dialog on the way.
        await ctrlW.click();
        await modal.locator('.keys-aside .keys-add', {hasText: 'Przypisz komendę'}).click();
        await expect(modal.locator('[data-section="own"] .keys-command')).toBeFocused();
        await modal.locator('[data-section="own"] .keys-command').fill('wesprzyj druzyne');

        // It is an own shortcut like any other — the helper is only where it is heard.
        const own = modal.locator('[data-section="own"] .keys-row');
        await expect(own.locator('.keys-command')).toHaveValue('wesprzyj druzyne');
        await expect(own.locator('.keys-kc')).toHaveText('Ctrl+W');
        await expect(modal.locator('[data-section="helper"]')).toContainText('skrót działa tylko w kliencie');

        // Its switch offers the two helper reaches, never "w kliencie".
        await own.click();
        await expect(reach(page)).toContainText('przez helpera');
        await expect(reach(page)).not.toContainText('w kliencie');

        await closeKeysWindow(page);
    });

    test('one switch sends a built-in bind outside the client on the same key, and back', async ({page}) => {
        await openKeysWindow(page);
        const modal = page.locator('#binds-modal');

        await modal.locator('[data-bind="slot:enemy[0]"]').click();
        const aside = modal.locator('.keys-aside');
        await expect(aside).toContainText('Atakuj wroga 1');

        await reach(page).getByText('wszędzie', {exact: true}).click();

        // Still one binding on one key, now marked as working everywhere.
        const row = modal.locator('[data-bind="slot:enemy[0]"]');
        await expect(row.locator('.keys-global-icon')).toHaveCount(1);
        await expect(bindKey(page, 'slot:enemy[0]')).toHaveText('F1');
        const f1 = modal.locator('.keys-key[data-code="F1"]');
        await expect(f1).not.toHaveClass(/is-conflict/);
        await expect(f1).toContainText('Wróg 1');

        // Nothing is listed twice: the helper block is about the helper itself.
        await expect(modal.locator('[data-section="helper"] .keys-command')).toHaveCount(0);

        await closeKeysWindow(page);
        await openKeysWindow(page);
        await modal.locator('[data-bind="slot:enemy[0]"]').click();
        await expect(reach(page).locator('.is-active')).toContainText('wszędzie');

        // And back: the key stays, the helper's copy goes.
        await reach(page).getByText('w kliencie', {exact: true}).click();
        await expect(row.locator('.keys-global-icon')).toHaveCount(0);
        await expect(bindKey(page, 'slot:enemy[0]')).toHaveText('F1');
        await closeKeysWindow(page);
    });

    test('an own shortcut keeps its command and key when it goes outside the client', async ({page}) => {
        await openKeysWindow(page);
        const modal = page.locator('#binds-modal');

        await modal.locator('[data-section="own"] .keys-add').filter({hasText: /^Komenda$/}).click();
        await modal.locator('[data-section="own"] .keys-command').fill('zabij cel');
        await captureKey(page, 'custom:0', 'F9');

        // The row is mostly a command field, so the pencil is the way to the panel.
        await modal.locator('[data-bind="custom:0"]').getByTitle('Pokaż klawisz i gdzie działa').click();
        await expect(modal.locator('.keys-aside')).toContainText('zabij cel');
        await reach(page).getByText('wszędzie', {exact: true}).click();
        await expect(modal.locator('[data-bind="custom:0"] .keys-global-icon')).toHaveCount(1);

        // Editing either half edits the binding: one row, one command, one key.
        await modal.locator('[data-section="own"] .keys-command').fill('zabij ob_1');
        await captureKey(page, 'custom:0', 'F10');
        await closeKeysWindow(page);
        await openKeysWindow(page);

        const own = modal.locator('[data-section="own"] .keys-row');
        await expect(own).toHaveCount(1);
        await expect(own.locator('.keys-command')).toHaveValue('zabij ob_1');
        await expect(own.locator('.keys-kc')).toHaveText('F10');
        await expect(own.locator('.keys-global-icon')).toHaveCount(1);

        // Deleting it takes the helper's copy with it.
        await own.getByRole('button', {name: 'Usuń'}).click();
        await expect(modal.locator('[data-section="own"] .keys-row')).toHaveCount(0);
        await closeKeysWindow(page);
        await openKeysWindow(page);
        await expect(modal.locator('[data-section="own"] .keys-row')).toHaveCount(0);
        await closeKeysWindow(page);
    });

    test('a global shortcut with its own command is made in one go', async ({page}) => {
        await openKeysWindow(page);
        const modal = page.locator('#binds-modal');

        // The helper flavour asks for the key first — a hotkey is registered by it.
        await modal.locator('[data-section="own"] .keys-add', {hasText: 'przez helpera'}).click();
        await expect(modal.locator('.keys-capturebar')).toBeVisible();
        await page.keyboard.press('F9');

        const own = modal.locator('[data-section="own"] .keys-row');
        await expect(own.locator('.keys-command')).toBeFocused();
        await own.locator('.keys-command').fill('zabij cel');

        await expect(own.locator('.keys-kc')).toHaveText('F9');
        await expect(own.locator('.keys-global-icon')).toHaveCount(1);

        await closeKeysWindow(page);
        await openKeysWindow(page);
        await expect(own.locator('.keys-command')).toHaveValue('zabij cel');
        await own.click();
        await expect(reach(page).locator('.is-active')).toContainText('wszędzie');
        await closeKeysWindow(page);
    });

    test('a built-in bind can be left without a key from the panel', async ({page}) => {
        await openKeysWindow(page);
        const modal = page.locator('#binds-modal');

        await modal.locator('[data-bind="slot:lamp"]').click();
        await modal.locator('.keys-aside .keys-act').getByRole('button', {name: 'Zdejmij klawisz'}).click();

        await expect(bindKey(page, 'slot:lamp')).toHaveText('brak');
        await expect(modal.locator('.keys-key[data-code="Digit4"]')).not.toContainText('Lampa');

        await closeKeysWindow(page);
        await openKeysWindow(page);
        await expect(bindKey(page, 'slot:lamp')).toHaveText('brak');
        await closeKeysWindow(page);
    });

    test('picking a key, or starting a capture, never moves the lists', async ({page}) => {
        await openKeysWindow(page);
        const modal = page.locator('#binds-modal');
        const lists = modal.locator('[data-section="basic"]');

        // Where the lists sit inside the window, not on screen: clicking a row
        // scrolls it into view, which moves the viewport but is not a shift.
        const at = () => lists.evaluate(el => (el as HTMLElement).offsetTop);
        const start = await at();

        // The panel on the right fills in, but it scrolls rather than grows.
        await modal.locator('[data-bind="slot:enemy[0]"]').click();
        expect(await at()).toBe(start);

        // The capture prompt floats over the window instead of pushing it down.
        await modal.locator('[data-section="helper"] .keys-add', {hasText: 'Nadaj klawisz'}).click();
        await expect(modal.locator('.keys-capturebar')).toBeVisible();
        expect(await at()).toBe(start);

        await modal.locator('.keys-capturebar').getByRole('button', {name: 'Anuluj'}).click();
        expect(await at()).toBe(start);

        await closeKeysWindow(page);
    });
});
