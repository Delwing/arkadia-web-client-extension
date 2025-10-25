import { EventEmitter } from 'events';
import initHerbCounter from '../../src/scripts/herbCounter';
import { normalizeHerbBagsState } from '../../src/types/herbs';

export class FakeClient {
  private emitter = new EventEmitter();
  private storageListeners: Record<string, Set<(value: any) => void>> = {};
  aliases: { pattern: RegExp; callback: Function }[] = [];
  Triggers = { registerTrigger: jest.fn() } as any;
  sendCommand = jest.fn();
  println = jest.fn();
  storeData: Record<string, any> = {};
  emitStorage(key: string, value: any) {
    this.storeData[key] = value;
    const listeners = this.storageListeners[key];
    if (listeners) {
      listeners.forEach((cb) => {
        Promise.resolve().then(() => cb(value));
      });
    }
  }
  store = {
    updateHerbCounts: jest.fn().mockResolvedValue(undefined),
    setStorageItem: jest.fn(async (key: string, value: any) => {
      (this as any).storeData[key] = value;
      (this as any).emitStorage(key, value);
    }),
    getStorageItem: jest.fn(async (key: string) => (this as any).storeData[key]),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    updateUiSettings: jest.fn().mockResolvedValue(undefined),
    getSettingsSnapshot: jest.fn(() => ({} as any)),
    subscribeStorage: jest.fn((key: string, cb: (value: any) => void) => {
      if (!this.storageListeners[key]) {
        this.storageListeners[key] = new Set();
      }
      this.storageListeners[key].add(cb);
      return () => {
        this.storageListeners[key].delete(cb);
      };
    }),
  } as any;
  herbManager: any;
  sendEvent(type: string, detail: any) {
    this.dispatch(type, detail);
  }
  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  removeEventListener(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  dispatch(event: string, detail: any) {
    this.emitter.emit(event, { detail });
  }
}

export const defaultHerbData = {
  herb_id_to_odmiana: {
    deliona: {
      mianownik: 'zolty jasny kwiat',
      dopelniacz: 'zoltego jasnego kwiata',
      biernik: 'zolty jasny kwiat',
      mnoga_mianownik: 'zolte jasne kwiaty',
      mnoga_dopelniacz: 'zoltych jasnych kwiatow',
      mnoga_biernik: 'zolte jasne kwiaty'
    }
  },
  version: 1,
  herb_id_to_use: {}
};

export function initHerbClient(
  client: {
    aliases: { pattern: RegExp; callback: Function }[];
    dispatch(event: string, detail: any): void;
    emitStorage(key: string, value: any): void;
    storeData: Record<string, any>;
  },
  herbCounts: Record<number, any> = {},
  herbData: any = defaultHerbData,
  aliases = client.aliases
) {
  const normalized = normalizeHerbBagsState(herbCounts);
  (client as any).storeData.herb_counts = normalized;
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(herbData)
  });
  initHerbCounter((client as unknown) as any, aliases);
  client.emitStorage('herb_counts', normalized);
}
