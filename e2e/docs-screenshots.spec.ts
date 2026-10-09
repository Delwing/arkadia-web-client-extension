import path from 'node:path';
import type {Locator, Page} from '@playwright/test';
import {expect, test} from './support/fixtures';
import {ensureGameSocket, primeCharInfo, pushText, waitForCommandInput} from './support/mocks';
import {addGroup, fillScriptCode, openAutomation, saveEditor, selectRow, startNewInGroup} from './support/automation';

/**
 * Regenerates the screenshots in docs/img used by Dokumentacja. Not a test:
 * skipped unless DOCS_SCREENSHOTS is set.
 *
 *   DOCS_SCREENSHOTS=1 yarn test:e2e e2e/docs-screenshots.spec.ts --workers=1
 */
test.skip(!process.env.DOCS_SCREENSHOTS, 'set DOCS_SCREENSHOTS=1 to regenerate the Dokumentacja screenshots');

const OUT = path.resolve(process.cwd(), 'docs/img/automatyzacje');

async function shoot(modal: Locator, name: string) {
    // Let caret blinks, transitions and Monaco's first paint settle.
    await modal.page().waitForTimeout(300);
    await modal.locator('.app-modal__dialog').screenshot({path: path.join(OUT, `${name}.png`), animations: 'disabled', caret: 'hide'});
}

async function addAction(modal: Locator, type: string): Promise<Locator> {
    await modal.getByRole('button', {name: 'Dodaj akcję'}).click();
    const action = modal.locator('.automation-act').last();
    await action.locator('select').first().selectOption(type);
    return action;
}

async function setUp(page: Page) {
    await page.setViewportSize({width: 1280, height: 1000});
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page);
    // Something to pick from in the trigger's "z ostatnich linii" menu.
    await pushText(page, 'Goblin atakuje cie!');
}

test('Automatyzacja screenshots', async ({page}) => {
    test.setTimeout(120_000);
    await setUp(page);
    const modal = await openAutomation(page);

    await addGroup(modal, 'Walka');

    // Alias
    await startNewInGroup(page, modal, 'Walka', 'alias');
    await modal.getByTitle('Nazwa (opcjonalna)').fill('Zabij cel');
    await modal.getByPlaceholder('np. zab (.+)').fill('^zab (.+)$');
    await modal.getByPlaceholder('np. zabij $1').fill('zabij $1');
    await modal.getByTitle('Przykładowa komenda').fill('zab goblina');
    await shoot(modal, 'alias');
    await saveEditor(modal);

    // Script, before the trigger so the trigger can run it
    await startNewInGroup(page, modal, 'Walka', 'script');
    await modal.getByTitle('Nazwa (opcjonalna)').fill('leczenie');
    await modal.getByTitle('Komenda', {exact: true}).fill('leczenie');
    await fillScriptCode(page, modal, [
        "const hp = gmcp.char?.state?.hp ?? 0;",
        "log('hp', hp);",
        "if (hp > 3) return;",
        "await send('wypij miksture');",
    ].join('\n'));
    await modal.getByRole('button', {name: 'Uruchom'}).click();
    await expect(modal.locator('.automation-console')).toBeVisible();
    await shoot(modal, 'skrypt');
    await saveEditor(modal);

    // Pattern trigger with a test line
    await startNewInGroup(page, modal, 'Walka', 'trigger');
    await modal.getByTitle('Nazwa (opcjonalna)').fill('Kontra');
    await modal.getByTitle('Wzorzec', {exact: true}).fill('^(\\w+) atakuje cie');
    await addAction(modal, 'color');
    const command = await addAction(modal, 'command');
    await command.getByPlaceholder('Command').fill('zabij $1');
    await modal.getByTitle('Linia do testu').fill('Goblin atakuje cie!');
    await expect(modal.locator('.automation-out')).toContainText('zabij Goblin');
    await shoot(modal, 'wyzwalacz');
    await saveEditor(modal);

    // Event trigger with a condition
    await startNewInGroup(page, modal, 'Walka', 'trigger');
    await modal.getByTitle('Nazwa (opcjonalna)').fill('Mało życia');
    await modal.getByLabel('Zdarzenie').check();
    await modal.getByTitle('Zdarzenie', {exact: true}).selectOption('__gmcp__');
    await modal.getByTestId('trigger-gmcp-type').selectOption('gmcp.char.state');
    await modal.getByRole('button', {name: 'Dodaj warunek'}).click();
    const condition = modal.locator('.trigger-condition');
    await condition.locator('select').nth(1).selectOption('lte');
    await condition.getByPlaceholder('Wartość').fill('2');
    const run = await addAction(modal, 'script');
    await expect(run.getByTitle('Skrypt')).toHaveValue(/.+/);
    const speak = await addAction(modal, 'speak');
    await speak.locator('input[type="text"], textarea').first().fill('Mało życia');
    await shoot(modal, 'zdarzenie');
    await saveEditor(modal);

    // The list, with nothing open
    await selectRow(modal, 'Zabij cel');
    await page.mouse.move(0, 0);
    await shoot(modal, 'lista');
});
