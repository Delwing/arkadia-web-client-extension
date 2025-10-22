import 'fake-indexeddb/auto';

class LocalStorageMock {
  private store: Record<string, string> = {};
  clear() { this.store = {}; }
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new LocalStorageMock();
}

if (typeof globalThis.structuredClone !== 'function') {
  (globalThis as any).structuredClone = (val: any) => JSON.parse(JSON.stringify(val));
}

if (typeof globalThis.fetch !== 'function') {
  if (typeof global.fetch === 'function') {
    (globalThis as any).fetch = global.fetch.bind(global);
  } else {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        magics: {},
        magic_keys: [],
        herb_id_to_odmiana: {},
        version: 1,
        herb_id_to_use: {}
      }),
    });
  }
}

export {};
