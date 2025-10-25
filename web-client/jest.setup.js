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

if (typeof globalThis.pako === 'undefined') {
  class InflateMock {
    constructor() {
      this.result = [];
      this.err = 0;
      this.msg = '';
      this.chunks = [];
      this.ended = false;
    }

    push() {}
  }

  globalThis.pako = {
    Inflate: InflateMock,
    inflate: (input) => input,
    ungzip: (input) => input,
  };
}

const { defaultSettings } = require('@client/src/defaultSettings');

const storeState = {
  settings: { ...defaultSettings },
  uiSettings: {},
  binds: {},
  status: 'ready',
};

const storeListeners = {
  settings: new Set(),
  uiSettings: new Set(),
  binds: new Set(),
};

function notify(kind) {
  const listeners = storeListeners[kind];
  listeners.forEach((entry) => {
    const next = entry.selector(storeState[kind]);
    const isEqual = entry.equalityFn ? entry.equalityFn(next, entry.current) : Object.is(next, entry.current);
    if (!isEqual) {
      const prev = entry.current;
      entry.current = next;
      entry.listener(next, prev);
    }
  });
}

function subscribe(kind, selector, listener, options = {}) {
  const entry = {
    selector,
    listener,
    equalityFn: options.equalityFn,
    current: selector(storeState[kind]),
  };
  storeListeners[kind].add(entry);
  if (options.fireImmediately) {
    listener(entry.current, entry.current);
  }
  return () => {
    storeListeners[kind].delete(entry);
  };
}

storeState.initializeFromStorage = async () => {};
storeState.updateSettings = async (partial) => {
  storeState.settings = { ...defaultSettings, ...storeState.settings, ...partial };
  notify('settings');
};
storeState.updateUiSettings = async (partial) => {
  storeState.uiSettings = { ...storeState.uiSettings, ...partial };
  notify('uiSettings');
};
storeState.updateBinds = async (partial) => {
  storeState.binds = { ...storeState.binds, ...partial };
  notify('binds');
};

const settingsStoreMock = {
  getState: () => storeState,
  setState: (updater) => {
    const nextState = typeof updater === 'function' ? updater(storeState) : updater;
    if (!nextState) {
      return;
    }
    if (nextState.settings) {
      storeState.settings = nextState.settings;
      notify('settings');
    }
    if (nextState.uiSettings) {
      storeState.uiSettings = nextState.uiSettings;
      notify('uiSettings');
    }
    if (nextState.binds) {
      storeState.binds = nextState.binds;
      notify('binds');
    }
    if (nextState.status) {
      storeState.status = nextState.status;
    }
  },
};

jest.mock('@client/src/state/settingsStore', () => ({
  settingsStore: settingsStoreMock,
  subscribeToSettings: (selector, listener, options) => subscribe('settings', selector, listener, options),
  subscribeToUiSettings: (selector, listener, options) => subscribe('uiSettings', selector, listener, options),
  subscribeToBinds: (selector, listener, options) => subscribe('binds', selector, listener, options),
  useSettingsSlice: (selector) => selector(storeState.settings),
  useUiSettingsSlice: (selector) => selector(storeState.uiSettings),
  useBindsSlice: (selector) => selector(storeState.binds),
  useSettingsStore: (selector) => selector(storeState),
}));
