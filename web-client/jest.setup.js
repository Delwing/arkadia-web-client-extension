const indexedDBAuto = require('fake-indexeddb/auto');

class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  clear() { this.store = {}; }
  getItem(key) { return this.store[key] ?? null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new LocalStorageMock();
}

if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (val) => JSON.parse(JSON.stringify(val));
}

if (typeof globalThis.fetch !== 'function') {
  if (typeof global.fetch === 'function') {
    globalThis.fetch = global.fetch.bind(global);
  } else {
    globalThis.fetch = jest.fn().mockResolvedValue({
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
