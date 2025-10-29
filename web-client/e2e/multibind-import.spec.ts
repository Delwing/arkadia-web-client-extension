import type {Page} from '@playwright/test';
import {expect, test} from './support/test-fixture';
import {
    ensureGameSocket,
    getMultibindRequests,
    installMultibindWorkerMock,
    queueMultibindResponse,
    waitForClientReady,
} from './support/mocks';

async function openBindsModal(page: Page) {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await page.click('#menu-button');
    await page.click('#binds-button');
    const modal = page.locator('#binds-modal');
    await expect(modal, 'should display binds modal after navigation').toBeVisible();
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
                    { uniqness: '100:1', roomId: 100, index: 1, action: 'atak trolla' },
                    { uniqness: '100:1', roomId: 100, index: 1, action: 'atak toporem' },
                    { uniqness: '100:2', roomId: 100, index: 2, action: 'osloń mnie' },
                    { uniqness: '200:1', roomId: 200, index: 1, action: 'skradanie' },
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
        await expect(importModal.getByText('Importowanie…'), 'should hide progress indicator after completion').not.toBeVisible({ timeout: 10_000 });
        await expect(importModal.getByText('Import zakończony.'), 'should confirm import completion').toBeVisible();
        await expect(importModal, 'should reiterate new entries count after import').toContainText('Nowe wpisy: 3');
        await expect(importModal, 'should reiterate updated entries count after import').toContainText('Zaktualizowane: 0');
        await expect(importModal, 'should reiterate skipped entries count after import').toContainText('Pominięte: 2');

        await importModal.getByRole('button', { name: 'Zamknij' }).click();
        await expect(importModal, 'should close import modal after acknowledgement').not.toBeVisible();

        const requests = await getMultibindRequests(page);
        expect(
            requests.some((request) => request?.type === 'parse'),
            'should send parse request to multibind worker'
        ).toBe(true);

        await page.evaluate(() => {
            const client: any = (window as any).clientExtension;
            client.Map.currentRoom = { id: 100 } as any;
            client.eventTarget.emit('enterLocation', { id: 100, room: {} });
        });

        const multiBinds = page.locator('#multi-binds');
        await expect(multiBinds, 'should activate multi-bind list for current room').toHaveClass(/active/);
        const entries = multiBinds.locator('.multi-bind');
        await expect(entries, 'should render entries for current room').toHaveCount(2);
        await expect(entries.nth(0), 'should display hotkey for first multibind').toContainText('[ALT+1]');
        await expect(entries.nth(0), 'should display action text for first multibind').toContainText('atak toporem');
        await expect(entries.nth(1), 'should display hotkey for second multibind').toContainText('[ALT+2]');
        await expect(entries.nth(1), 'should display action text for second multibind').toContainText('osloń mnie');

        await page.evaluate(() => {
            const client: any = (window as any).clientExtension;
            client.Map.currentRoom = { id: 200 } as any;
            client.eventTarget.emit('enterLocation', { id: 200, room: {} });
        });
        await expect(entries, 'should update entries when entering different room').toHaveCount(1);
        await expect(entries.first(), 'should show action for room-specific bind').toContainText('skradanie');
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

        const requests = await getMultibindRequests(page);
        expect(
            requests.some((request) => request?.type === 'parse'),
            'should still send parse request despite failure'
        ).toBe(true);
    });
});
