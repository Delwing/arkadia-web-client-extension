import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { EventEmitter } from 'events';
import { initHerbClient, defaultHerbData } from './helpers/herbClient';

class FakeClient {
  private emitter = new EventEmitter();
  private storageListeners: Record<string, Set<(value: any) => void>> = {};
  Triggers = new Triggers(({} as unknown) as any);
  sendCommand = jest.fn();
  println = jest.fn();
  storeData: Record<string, any> = {};
  store = {
    updateHerbCounts: jest.fn().mockResolvedValue(undefined),
    setStorageItem: jest.fn(async (key: string, value: any) => {
      this.storeData[key] = value;
      this.emitStorage(key, value);
    }),
    getStorageItem: jest.fn(async (key: string) => this.storeData[key]),
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
  emitStorage(key: string, value: any) {
    this.storeData[key] = value;
    const listeners = this.storageListeners[key];
    if (listeners) {
      listeners.forEach((cb) => {
        Promise.resolve().then(() => cb(value));
      });
    }
  }
  sendEvent = jest.fn((type: string, detail: any) => {
    this.dispatch(type, detail);
  });
  private index = 0;
  OutputHandler = {
    makeStringRightClickable: (str: string) => {
      const idx = this.index++;
      return `{clickOpen:${idx}}${str}{clickClose}`;
    }
  } as any;
  FunctionalBind = { set: jest.fn() } as any;
  contentWidth = 80;
  addEventListener(event: string, cb: any) { this.emitter.on(event, cb); }
  removeEventListener(event: string, cb: any) { this.emitter.off(event, cb); }
  dispatch(event: string, detail: any) { this.emitter.emit(event, { detail }); }
}

describe('herb counter', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let start: () => void;

  beforeEach(() => {
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    start = aliases[0].callback as any;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('counts herbs from bags', async () => {
    await start();
    expect(client.sendCommand).toHaveBeenCalledWith('policz swoje woreczki');
    parse('Doliczyles sie dwoch sztuk.');
    expect(client.sendCommand).toHaveBeenCalledWith('zajrzyj do 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenCalledWith('zajrzyj do 2. swojego woreczka');
    parse('Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W srodku dostrzegasz dwa zolte jasne kwiaty.');
    parse('Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W srodku dostrzegasz zolty jasny kwiat.');
    const printed = client.println.mock.calls[0][0];
    expect(printed).toMatch(/3/);
    expect(printed).toMatch(/deliona/);
    expect(printed).toMatch(/1\.\s+2 {clickOpen:\d+}deliona{clickClose}/);
    expect(printed).toMatch(/2\.\s+1 {clickOpen:\d+}deliona{clickClose}/);
  });

  test('splits summary when width is limited', async () => {
    client.contentWidth = 40;
    client.dispatch('contentWidth', 40);
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient(
      (client as unknown) as any,
      {},
      {
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
        herb_id_to_use: {
          deliona: [
            { action: 'eat', effect: '+hp' },
            { action: 'rub', effect: '+mana' }
          ]
        }
      },
      aliases
    );
    const start2 = aliases[0].callback as any;
    const parse2 = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
    await start2();
    parse2('Doliczyles sie jednej sztuki.');
    parse2(
      'Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W srodku dostrzegasz zolty jasny kwiat.'
    );
    const printed = client.println.mock.calls[0][0];
    const lines = printed.split('\n');
    lines.forEach((l) => {
      expect(stripAnsiCodes(l).length).toBeLessThanOrEqual(client.contentWidth);
    });
  });

  test('prints summary from storage', async () => {
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    const showEntry = aliases.find(({ pattern }) => pattern.test('/ziola_pokaz'));
    expect(showEntry).toBeTruthy();
    const show = showEntry!.callback as any;
    const printedPromise = new Promise<string>((resolve) => {
      client.println.mockImplementationOnce((line: string) => {
        resolve(line);
      });
    });
    client.emitStorage('herb_counts', { 1: { deliona: 2 } });
    await Promise.resolve();
    show();
    const printed = await printedPromise;
    expect(printed).toMatch(/2/);
    expect(printed).toMatch(/deliona/);
  });

  test('woreczki alias updates bag conditions', async () => {
    jest.useFakeTimers();
    try {
      const aliases: { pattern: RegExp; callback: () => void }[] = [];
      initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
      const wearEntry = aliases.find(({ pattern }) => pattern.test('/woreczki_buduj'));
      expect(wearEntry).toBeTruthy();
      client.sendCommand.mockClear();
      client.store.updateHerbCounts.mockClear();
      wearEntry?.callback();
      expect(client.sendCommand).toHaveBeenCalledWith('ocen wszystkie woreczki');
      parse('Ten element ekwipunku wyglada na troche zuzyty.');
      parse('Ten element ekwipunku wyglada na calkiem nowy.');
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      const setCalls = client.store.updateHerbCounts.mock.calls.map(([arg]) => arg);
      expect(setCalls[setCalls.length - 1]).toEqual({
        1: { herbs: {}, condition: 3 },
        2: { herbs: {}, condition: 5 }
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('opens herb manager overlay via alias', () => {
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola'));
    expect(entry).toBeTruthy();
    client.sendEvent.mockClear();
    entry?.callback();
    expect(client.sendEvent).toHaveBeenCalledWith('herbManagerOpen');
  });

  test('herb manager can move herbs between bags', async () => {
    initHerbClient((client as unknown) as any, { 1: { deliona: 1 }, 2: {} });
    const manager = (client as unknown as any).herbManager;
    await manager.move({ herbId: 'deliona', amount: 1, fromBag: 1, toBag: 2 });
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wez zolty jasny kwiat z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'otworz 2. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(5, 'wloz zolty jasny kwiat do 2. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(6, 'zamknij 2. swoj woreczek');
    const setCalls = client.store.updateHerbCounts.mock.calls.map(([arg]) => arg);
    expect(setCalls).toContainEqual({ 1: { herbs: {} }, 2: { herbs: { deliona: 1 } } });
  });

  test('herb manager put adds herbs to bag', async () => {
    initHerbClient((client as unknown) as any, { 1: {} });
    const manager = (client as unknown as any).herbManager;
    await manager.put('deliona', 2, 1);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wloz 2 zolte jasne kwiaty do 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    const setCalls = client.store.updateHerbCounts.mock.calls.map(([arg]) => arg);
    expect(setCalls).toContainEqual({ 1: { herbs: { deliona: 2 } } });
  });
});
