import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { StorageUsage, formatBytes, storageCard } from '@web/commandInput/StorageUsage.tsx';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MB = 1024 * 1024;
const GB = 1024 * MB;

function stubStorage(storage: Partial<StorageManager> | undefined): void {
    Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });
}

describe('StorageUsage', () => {
    let host: HTMLElement;
    let root: Root;

    beforeEach(() => {
        host = document.createElement('div');
        root = createRoot(host);
    });

    afterEach(() => {
        act(() => root.unmount());
        stubStorage(undefined);
        vi.restoreAllMocks();
    });

    async function render(): Promise<HTMLElement | null> {
        await act(async () => root.render(<StorageUsage />));
        return host.querySelector<HTMLElement>('.command-menu__storage');
    }

    it('shows what is used of the quota and that it is persistent', async () => {
        stubStorage({
            estimate: async () => ({ usage: 531.7 * MB, quota: 2048 * MB }),
            persisted: async () => true,
        });
        const row = await render();
        expect(row?.dataset.level).toBe('ok');
        expect(row?.textContent).toContain('531,7 MB z 2 GB');
        expect(row?.textContent).toContain('trwała');
        expect(row?.hasAttribute('title')).toBe(false);
        expect(host.querySelector<HTMLElement>('.command-menu__storage-fill')!.style.width).toBe(`${(531.7 / 2048) * 100}%`);
    });

    it('warns near a full quota and when the storage is not persistent', async () => {
        stubStorage({
            estimate: async () => ({ usage: 1900 * MB, quota: 2000 * MB }),
            persisted: async () => false,
        });
        const row = await render();
        expect(row?.dataset.level).toBe('danger');
        expect(row?.textContent).toContain('nietrwała');
    });

    it('renders nothing where the browser cannot tell', async () => {
        stubStorage(undefined);
        expect(await render()).toBeNull();
    });
});

describe('formatBytes', () => {
    it('counts megabytes until a gigabyte, with one decimal at most', () => {
        expect(formatBytes(531.74 * MB)).toBe('531,7 MB');
        expect(formatBytes(2147 * MB)).toBe('2,1 GB');
        expect(formatBytes(0)).toBe('0 MB');
    });
});

describe('storageCard', () => {
    it('gives the share, what the persistence means, and where to free space', () => {
        const card = storageCard({ used: 531.7 * MB, quota: 2048 * MB, persisted: false });
        expect(card.header).toBe('Pamięć przeglądarki');
        const rows = card.rows as { label: string; content: string }[];
        expect(rows[0]).toEqual({ label: 'zajęte', content: '531,7 MB z 2 GB (26%)' });
        expect(rows[1].label).toBe('nietrwała');
        expect(rows[1].content).toContain('może usunąć');
        expect(rows[2].content).toContain('Logi → Zarządzaj');
    });

    it('says the data stays when the storage is persistent', () => {
        const rows = storageCard({ used: MB, quota: GB, persisted: true }).rows as { label: string; content: string }[];
        expect(rows[1].label).toBe('trwała');
        expect(rows[1].content).toContain('nie usunie');
    });
});
