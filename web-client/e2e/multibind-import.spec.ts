import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getMultibindRequests,
    installMockWebSocket,
    installMultibindWorkerMock,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockNpcDownload,
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
    await expect(modal).toBeVisible();
    return modal;
}

test.beforeEach(async ({context}) => {
    await mockMagicsDownload(context);
    await mockMagicKeysDownload(context);
    await mockNpcDownload(context);
    await installMockWebSocket(context);
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
        await expect(importModal).toBeVisible();
        await expect(importModal).toContainText('Łącznie wierszy: 5');
        await expect(importModal).toContainText('Wiersze do importu: 3');
        await expect(importModal).toContainText('Nowe wpisy: 3');
        await expect(importModal).toContainText('Aktualizacje: 0');
        await expect(importModal).toContainText('Pominięte: 2');
        await expect(importModal).toContainText('Nieprawidłowe wiersze: 1');
        await expect(importModal).toContainText('Usunięte konflikty: 1');

        await importModal.getByRole('button', { name: 'Importuj' }).click();
        await expect(importModal.getByText('Importowanie…')).toBeVisible();
        await expect(importModal.getByText('Importowanie…')).not.toBeVisible({ timeout: 10_000 });
        await expect(importModal.getByText('Import zakończony.')).toBeVisible();
        await expect(importModal).toContainText('Nowe wpisy: 3');
        await expect(importModal).toContainText('Zaktualizowane: 0');
        await expect(importModal).toContainText('Pominięte: 2');

        await importModal.getByRole('button', { name: 'Zamknij' }).click();
        await expect(importModal).not.toBeVisible();

        const requests = await getMultibindRequests(page);
        expect(requests.some((request) => request?.type === 'parse')).toBe(true);

        await page.evaluate(() => {
            const client: any = (window as any).clientExtension;
            client.Map.currentRoom = { id: 100 } as any;
            client.eventTarget.emit('enterLocation', { id: 100, room: {} });
        });

        const multiBinds = page.locator('#multi-binds');
        await expect(multiBinds).toHaveClass(/active/);
        const entries = multiBinds.locator('.multi-bind');
        await expect(entries).toHaveCount(2);
        await expect(entries.nth(0)).toContainText('[ALT+1]');
        await expect(entries.nth(0)).toContainText('atak toporem');
        await expect(entries.nth(1)).toContainText('[ALT+2]');
        await expect(entries.nth(1)).toContainText('osloń mnie');

        await page.evaluate(() => {
            const client: any = (window as any).clientExtension;
            client.Map.currentRoom = { id: 200 } as any;
            client.eventTarget.emit('enterLocation', { id: 200, room: {} });
        });
        await expect(entries).toHaveCount(1);
        await expect(entries.first()).toContainText('skradanie');
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
        await expect(errorAlert).toBeVisible();
        await expect(errorAlert).toHaveText('Nie udało się sparsować bazy.');
        await expect(triggerButton).toBeEnabled();

        const multiBinds = page.locator('#multi-binds .multi-bind');
        await expect(multiBinds).toHaveCount(0);

        const requests = await getMultibindRequests(page);
        expect(requests.some((request) => request?.type === 'parse')).toBe(true);
    });
});
