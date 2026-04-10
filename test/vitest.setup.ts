import { vi } from 'vitest';
import 'fake-indexeddb/auto';

// --- jest → vi compat shim ---------------------------------------------------
// During the Jest→Vitest migration we expose `vi` under the `jest` global so
// existing tests that call `jest.fn()`, `jest.spyOn()`, `jest.useFakeTimers()`,
// `jest.advanceTimersByTime()`, etc. keep working without a global edit pass.
//
// CAVEAT: Vitest only hoists `vi.mock(...)` calls, not `jest.mock(...)` — if a
// test uses top-level `jest.mock('...')` the mock will run too late. Those
// need to be rewritten as `vi.mock(...)` (or moved into the setup file).
(globalThis as unknown as { jest: typeof vi }).jest = vi;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// TextEncoder/TextDecoder are needed by firebaseCrypto and other modules
if (typeof globalThis.TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = await import('util');
    (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
    (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}

// crypto.subtle is needed by firebaseCrypto (available in Node 15+)
// jsdom provides its own crypto without subtle, so we must override it
const { webcrypto } = await import('crypto');
if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true,
    });
}

class LocalStorageMock {
    private store: Record<string, string> = {};
    clear() { this.store = {}; }
    getItem(key: string) { return this.store[key] ?? null; }
    setItem(key: string, value: string) { this.store[key] = String(value); }
    removeItem(key: string) { delete this.store[key]; }
}

if (typeof globalThis.localStorage === 'undefined') {
    (globalThis as unknown as { localStorage: Storage }).localStorage = new LocalStorageMock() as unknown as Storage;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.structuredClone !== 'function') {
    globalThis.structuredClone = (val) => JSON.parse(JSON.stringify(val));
}

if (typeof globalThis.fetch !== 'function') {
    globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            magics: {},
            magic_keys: [],
            herb_id_to_odmiana: {},
            version: 1,
            herb_id_to_use: {},
        }),
    }) as unknown as typeof fetch;
}

if (typeof (globalThis as unknown as { pako?: unknown }).pako === 'undefined') {
    class InflateMock {
        result: unknown[] = [];
        err = 0;
        msg = '';
        chunks: unknown[] = [];
        ended = false;
        push() {}
    }

    (globalThis as unknown as { pako: unknown }).pako = {
        Inflate: InflateMock,
        inflate: (input: unknown) => input,
        ungzip: (input: unknown) => input,
    };
}

vi.mock('mudlet-map-renderer', () => import('./__mocks__/mudlet-map-renderer.js'));

vi.mock('@modules/data/peopleStore', () => ({
    subscribe: vi.fn(() => vi.fn()),
    refresh: vi.fn().mockResolvedValue(undefined),
    forceRefresh: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
}));
