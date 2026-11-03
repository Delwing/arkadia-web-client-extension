import { afterEach, describe, expect, it } from 'vitest';
import { detectBrowser, persistenceGuide, requestPersistence } from '@web/storage/persistence.ts';

function stubStorage(storage: Partial<StorageManager> | undefined): void {
    Object.defineProperty(navigator, 'storage', { value: storage, configurable: true });
}

describe('persistence', () => {
    afterEach(() => stubStorage(undefined));

    it('tells the browsers apart by their user agent', () => {
        expect(detectBrowser('Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('firefox');
        expect(detectBrowser('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('edge');
        expect(detectBrowser('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 OPR/115.0')).toBe('opera');
        expect(detectBrowser('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('chrome');
        expect(detectBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe('safari');
        expect(detectBrowser('curl/8')).toBe('other');
    });

    it('gives each browser its own way to grant it', () => {
        expect(persistenceGuide('firefox').steps.join(' ')).toContain('Zezwól');
        expect(persistenceGuide('chrome').steps.join(' ')).toContain('Zainstaluj');
        expect(persistenceGuide('safari').steps.join(' ')).toContain('Dock');
        expect(persistenceGuide('other').steps.length).toBeGreaterThan(0);
    });

    it('asks only when not granted yet, and reports what the browser said', async () => {
        let asked = 0;
        stubStorage({ persisted: async () => false, persist: async () => { asked += 1; return true; } });
        expect(await requestPersistence()).toBe(true);
        expect(asked).toBe(1);
        stubStorage({ persisted: async () => true, persist: async () => { asked += 1; return false; } });
        expect(await requestPersistence()).toBe(true);
        expect(asked).toBe(1);
        stubStorage(undefined);
        expect(await requestPersistence()).toBe(false);
    });
});
