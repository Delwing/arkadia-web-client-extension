import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    getMultibindRequests,
    installMultibindWorkerMock,
    submitCommand,
    queueMultibindResponse,
    waitForCommandInput,
} from './support/mocks';

async function openBindsModal(page: Page) {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await page.click('#menu-button');
    await page.click('#binds-button');
    const modal = page.locator('#binds-modal');
    await expect(modal, 'should display binds modal after navigation').toBeVisible();
    return modal;
}

async function closeBindsModal(page: Page) {
    const modal = page.locator('#binds-modal');
    await modal.locator('.btn-close').click();
    await expect(modal, 'should close binds modal after finishing checks').not.toBeVisible();
}

async function openAliasesModal(page: Page) {
    await page.click('#menu-button');
    await page.click('#aliases-button');
    const modal = page.locator('#aliases-modal');
    await expect(modal, 'should display aliases modal when requested').toBeVisible();
    return modal;
}

test.beforeEach(async ({context}) => {
    await installMultibindWorkerMock(context);
});

test.describe('Multibind import', () => {
    test('imports database rows and updates multi-bind list', async ({page}) => {
        await openBindsModal(page);
        await queueMultibindResponse(page, {
            type: 'success',
            payload: {
                rows: [
                    { uniqness: '3:1', roomId: 3, index: 1, action: 'atak trolla' },
                    { uniqness: '3:1', roomId: 3, index: 1, action: 'atak toporem' },
                    { uniqness: '3:2', roomId: 3, index: 2, action: 'osloń mnie' },
                    { uniqness: '4:1', roomId: 4, index: 1, action: 'skradanie' },
                ],
                totalRows: 5,
                invalidRows: 1,
            },
        });

        await page.getByRole('button', { name: 'Importuj bazę multibindów…' }).click();
        await page.setInputFiles('#binds-modal input[type="file"]', {
            name: 'sample.db',
            mimeType: 'application/x-sqlite3',
            buffer: Buffer.alloc(0),
        });

        const importModal = page.locator('.modal.show').filter({
            has: page.locator('.modal-title:has-text("Importuj bazę multibindów")'),
        });
        await expect(importModal, 'should show import summary modal').toBeVisible();
        await expect(importModal, 'should summarize total rows to process').toContainText('Łącznie wierszy: 5');
        await expect(importModal, 'should list rows selected for import').toContainText('Wiersze do importu: 3');
        await expect(importModal, 'should count new entries to import').toContainText('Nowe wpisy: 3');
        await expect(importModal, 'should report number of updates').toContainText('Aktualizacje: 0');
        await expect(importModal, 'should report skipped rows').toContainText('Pominięte: 2');
        await expect(importModal, 'should report invalid rows').toContainText('Nieprawidłowe wiersze: 1');
        await expect(importModal, 'should report resolved conflicts').toContainText('Usunięte konflikty: 1');

        await importModal.getByRole('button', { name: 'Importuj' }).click();
        await expect(importModal.getByText('Importowanie…'), 'should show import in progress').toBeVisible();
        await expect(importModal.getByText('Importowanie…'), 'should hide progress indicator after completion').not.toBeVisible({ timeout: 5000 });
        await expect(importModal.getByText('Import zakończony.'), 'should confirm import completion').toBeVisible();
        await expect(importModal, 'should reiterate new entries count after import').toContainText('Nowe wpisy: 3');
        await expect(importModal, 'should reiterate updated entries count after import').toContainText('Zaktualizowane: 0');
        await expect(importModal, 'should reiterate skipped entries count after import').toContainText('Pominięte: 2');

        await importModal.getByRole('button', { name: 'Zamknij' }).click();
        await expect(importModal, 'should close import modal after acknowledgement').not.toBeVisible();

        await closeBindsModal(page);

        const requests = await getMultibindRequests(page);
        expect(
            requests.some((request) => request?.type === 'parse'),
            'should send parse request to multibind worker'
        ).toBe(true);

        await submitCommand(page, '/ustaw 3')

        const multiBinds = page.locator('#multi-binds');
        await expect(multiBinds, 'should activate multi-bind list for current room').toHaveClass(/active/);
        const entries = multiBinds.locator('.multi-bind');
        await expect(entries, 'should render entries for current room').toHaveCount(2);
        await expect(entries.nth(0), 'should display hotkey for first multibind').toContainText('[ALT+1]');
        await expect(entries.nth(0), 'should display action text for first multibind').toContainText('atak toporem');
        await expect(entries.nth(1), 'should display hotkey for second multibind').toContainText('[ALT+2]');
        await expect(entries.nth(1), 'should display action text for second multibind').toContainText('osloń mnie');

        await submitCommand(page, '/ustaw 4')
        await expect(entries, 'should update entries when entering different room').toHaveCount(1);
        await expect(entries.first(), 'should show action for room-specific bind').toContainText('skradanie');

        await submitCommand(page, '/mbind+ przyczaj sie');
        await page.waitForFunction(() => {
            const items = Array.from(
                document.querySelectorAll<HTMLDivElement>('#multi-binds .multi-bind'),
            );
            return items.length >= 2 && items[items.length - 1]?.textContent?.includes('przyczaj sie');
        });
        await expect(entries, 'should append alias-created multibind for current room').toHaveCount(2);
        await expect(entries.nth(0), 'should keep original multibind after alias creation').toContainText('[ALT+1]');
        await expect(entries.nth(0), 'should keep action of original multibind after alias creation').toContainText('skradanie');
        await expect(entries.nth(1), 'should assign next key to alias-created multibind').toContainText('[ALT+2]');
        await expect(entries.nth(1), 'should display action for alias-created multibind').toContainText('przyczaj sie');

        const aliasPattern = 'fooalias';
        const aliasCommand = 'powiedz czesc';
        const aliasesModal = await openAliasesModal(page);

        await aliasesModal.getByRole('button', { name: 'Dodaj alias' }).click();
        await aliasesModal.getByPlaceholder('np. ^zab (.+)$').fill(aliasPattern);
        await aliasesModal.getByPlaceholder('np. zabij $1').fill(aliasCommand);
        await aliasesModal.getByRole('button', { name: 'Dodaj', exact: true }).click();
        await expect(
            aliasesModal.locator('.alias-card').filter({ hasText: aliasPattern }),
            'should display newly created alias entry',
        ).toContainText(aliasCommand);

        await aliasesModal.locator('.btn-close').click();
        await expect(aliasesModal, 'should close aliases modal after creating alias').not.toBeVisible();

        await submitCommand(page, `/mbind 3 ${aliasPattern}`);
        await expect(entries, 'should include alias multi-bind entry for current room').toHaveCount(3);

        const aliasBind = entries.nth(2);
        await expect(aliasBind, 'should assign key to alias multi-bind entry').toContainText('[ALT+3]');
        await expect(aliasBind, 'should list alias command for multi-bind entry').toContainText(aliasPattern);

        await page.evaluate(() => {
            const scope: any = window;
            scope.__resetCommandLog?.();
        });
        await aliasBind.click();
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should execute alias command when clicking multi-bind entry',
            })
            .toBe(aliasCommand);

        await page.evaluate(() => {
            const scope: any = window;
            scope.__resetCommandLog?.();
        });
        await page.locator('body').click();
        await page.keyboard.press('Alt+Digit3');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'should execute alias command when using multi-bind shortcut',
            })
            .toBe(aliasCommand);

        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await submitCommand(page, '/ustaw 4');

        const reloadedMultiBinds = page.locator('#multi-binds');
        await expect(reloadedMultiBinds, 'should keep multi-bind list active after reload').toHaveClass(/active/);
        const reloadedEntries = reloadedMultiBinds.locator('.multi-bind');
        await expect(reloadedEntries, 'should restore multi-bind entries after reload').toHaveCount(3);
        await expect(reloadedEntries.nth(0), 'should keep original multibind after reload').toContainText('skradanie');
        await expect(reloadedEntries.nth(1), 'should keep alias-created multibind after reload').toContainText('przyczaj sie');
        await expect(reloadedEntries.nth(2), 'should keep alias multi-bind after reload').toContainText(aliasPattern);
    });

    test('surfaced worker errors render an inline alert', async ({page}) => {
        await openBindsModal(page);

        await queueMultibindResponse(page, {
            type: 'error',
            message: 'Nie udało się sparsować bazy.',
        });

        const triggerButton = page.getByRole('button', { name: 'Importuj bazę multibindów…' });
        await triggerButton.click();
        await page.setInputFiles('#binds-modal input[type="file"]', {
            name: 'broken.db',
            mimeType: 'application/x-sqlite3',
            buffer: Buffer.alloc(0),
        });

        const errorAlert = page.locator('#binds-modal .alert-danger');
        await expect(errorAlert, 'should display worker error alert').toBeVisible();
        await expect(errorAlert, 'should show worker error message').toHaveText('Nie udało się sparsować bazy.');
        await expect(triggerButton, 'should re-enable import trigger after failure').toBeEnabled();

        const multiBinds = page.locator('#multi-binds .multi-bind');
        await expect(multiBinds, 'should not list multibinds when import fails').toHaveCount(0);

        await closeBindsModal(page);

        const requests = await getMultibindRequests(page);
        expect(
            requests.some((request) => request?.type === 'parse'),
            'should still send parse request despite failure'
        ).toBe(true);
    });
});
