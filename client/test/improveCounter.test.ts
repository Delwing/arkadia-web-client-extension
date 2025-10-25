import { initImproveCounter } from '../src/scripts/improveCounter';
import { initKillCounter } from '../src/scripts/kill';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { colorString, findClosestColor } from '../src/Colors';
import { EventEmitter } from 'events';
import { setItemSync } from '../src/storage';

class FakeClient {
  private emitter = new EventEmitter();
  private storageListeners: Record<string, Set<(value: any) => void>> = {};
  Triggers = new Triggers(({} as unknown) as any);
  TeamManager = { isInTeam: jest.fn() };
  prefix = (line: string, prefix: string) => prefix + line;
  print = jest.fn();
  println = jest.fn();
  port = { postMessage: jest.fn() } as any;
  storeData: Record<string, any> = {};
  store = {
    setStorageItem: jest.fn(async (key: string, value: any) => {
      this.storeData[key] = value;
      this.emitStorage(key, value);
    }),
    getStorageItem: jest.fn(async (key: string) => this.storeData[key]),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    updateUiSettings: jest.fn().mockResolvedValue(undefined),
    getSettingsSnapshot: jest.fn(() => ({} as any)),
    updateHerbCounts: jest.fn().mockResolvedValue(undefined),
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

  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  removeEventListener(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  dispatch(event: string, detail: any) {
    this.emitter.emit(event, { detail });
  }
  emitStorage(key: string, value: any) {
    this.storeData[key] = value;
    const listeners = this.storageListeners[key];
    if (listeners) {
      listeners.forEach((cb) => {
        Promise.resolve().then(() => cb(value));
      });
    }
  }
}

describe('improve counter', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let show: () => void;
  let showLifetime: () => void;
  let reset: () => void;
  let aliases: { pattern: RegExp; callback: any }[];

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    setItemSync('object_num', '1');
    client = new FakeClient();
    const killCounter = initKillCounter((client as unknown) as any, []);
    client.emitStorage('kill_counter', {});
    client.emitStorage('kill_counter_session', {});
    aliases = [];
    initImproveCounter((client as unknown) as any, killCounter, aliases);
    client.emitStorage('improve_counter', {});
    client.emitStorage('improve_counter_lifetime', {});
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
    show = aliases[0].callback;
    reset = aliases[1].callback;
    showLifetime = aliases[2].callback;
    // reset state using alias
    reset();
  });

  test('records state changes, prints notification and table', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    client.dispatch('gmcp.char.state', { improve: 3 });
    const orange = findClosestColor('#ffa500');
    const message = colorString('\tWlasnie wbiles postepy: male (czas: 0:30)', orange);
    expect(client.println).toHaveBeenCalledWith(message);
    show();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/2\. male/);
    expect(printed).toMatch(/czas 0:30/);
    expect(printed).toMatch(/zabici 1\/1/);
  });

  test('does nothing when level does not change', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    client.println.mockClear();
    client.dispatch('gmcp.char.state', { improve: 2 });
    expect(client.println).not.toHaveBeenCalled();
  });

  test('counts initial level above zero as multiple improvements', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });

  test('reset event clears entries', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    client.dispatch('gmcp.char.state', { improve: 3 });
    show();
    client.print.mockClear();
    client.dispatch('reset', undefined);
    show();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/Dzisiaj: 0/);
    expect(printed).not.toMatch(/1\. male/);
  });

  test('lifetime list persists', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    client.dispatch('gmcp.char.state', { improve: 3 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/\[\s*1\]/);
    expect(printed).toMatch(/- male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 3 postepow/);
    client.print.mockClear();
    // reset should not clear lifetime
    reset();
    showLifetime();
    const printed2 = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed2).toMatch(/WSZYSTKICH DO TEJ PORY: 3 postepow/);
  });

  test('manual lifetime aliases modify list', () => {
    const add = aliases.find((a) => a.pattern.source === '\\/postepy2\\+ ([0-9]+)$');
    const remove = aliases.find((a) => a.pattern.source === '\\/postepy2- ([0-9]+)$');
    const removeCount = aliases.find((a) => a.pattern.source === '\\/postepy2- ([0-9]+) ([0-9]+)$');
    expect(add).toBeDefined();
    expect(remove).toBeDefined();
    expect(removeCount).toBeDefined();
    add!.callback('/postepy2+ 2'.match(add!.pattern)!);
    let info = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(info).toMatch(/Dodano 2 postepow/);
    expect(info).toMatch(/lacznie: 2/);
    client.println.mockClear();
    showLifetime();
    let printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    client.print.mockClear();
    removeCount!.callback('/postepy2- 1 1'.match(removeCount!.pattern)!);
    info = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(info).toMatch(/Usunieto 1 postepow/);
    expect(info).toMatch(/lacznie: 1/);
    client.println.mockClear();
    showLifetime();
    printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- nieznaczne/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 1 postepow/);
  });

  test('ignores duplicate improvements for same level', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    client.dispatch('gmcp.char.state', { improve: 2 });
    client.dispatch('gmcp.char.state', { improve: 3 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 3 postepow/);
  });

  test('handles improvement delta', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    client.dispatch('gmcp.char.state', { improve: 4 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- nieduze/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 4 postepow/);
  });

  test('adds initial improvement when not yet recorded', () => {
    client.emitStorage('improve_counter', { level: 0 });
    client.dispatch('gmcp.char.state', { improve: 2 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    client.print.mockClear();
    // duplicate state should not add again
    client.dispatch('gmcp.char.state', { improve: 2 });
    showLifetime();
    const printed2 = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed2).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });

  test('adds missed improvements on login before lifetime loads', async () => {
    jest.useFakeTimers();
    const c = new FakeClient();
    const kill = initKillCounter((c as unknown) as any, []);
    c.emitStorage('kill_counter', {});
    c.emitStorage('kill_counter_session', {});
    const als: { pattern: RegExp; callback: any }[] = [];
    initImproveCounter((c as unknown) as any, kill, als);
    c.emitStorage('improve_counter', { level: 2, lastObjNum: 1 });
    await Promise.resolve();
    c.dispatch('gmcp.char.state', { improve: 4 });
    await Promise.resolve();
    c.emitStorage('improve_counter_lifetime', {});
    await Promise.resolve();
    const showLife = als.find((a) => a.pattern.source === '\\/postepy2$')!.callback;
    await Promise.resolve();
    showLife();
    const printed = stripAnsiCodes(c.print.mock.calls[0][0]);
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    expect(c.println).not.toHaveBeenCalled();
  });

  test('counts improvement without object number', () => {
    client.dispatch('gmcp.char.state', { improve: 1 });
    show();
    let printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/Dzisiaj: 1/);
    client.print.mockClear();
    showLifetime();
    printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 1 postepow/);
  });

  test('counts offline improvements and new gains after login', async () => {
    client.emitStorage('improve_counter', { level: 2, lastObjNum: 1 });
    client.emitStorage('improve_counter_lifetime', { entries: [{ date: '1970/1/1', count: 2 }] });
    await Promise.resolve();
    client.dispatch('gmcp.char.state', { improve: 4 });
    await Promise.resolve();
    showLifetime();
    let printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 4 postepow/);
    client.print.mockClear();
    client.dispatch('gmcp.char.state', { improve: 5 });
    client.dispatch('gmcp.char.state', { improve: 6 });
    await Promise.resolve();
    showLifetime();
    printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 6 postepow/);
  });

  test('accumulates improvements across sessions with object numbers', async () => {
    client.emitStorage('improve_counter', { level: 3, lastObjNum: 1 });
    client.emitStorage('improve_counter_lifetime', { entries: [{ date: '1970/1/1', count: 3 }] });
    await Promise.resolve();
    setItemSync('object_num', '2');
    client.dispatch('gmcp.char.state', { improve: 6 });
    await Promise.resolve();
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 9 postepow/);
  });

  test('does not re-add improvements when reconnecting with same object number', async () => {
    // simulate existing data: level 2 already recorded for object 1
    const c = new FakeClient();
    const kill = initKillCounter((c as unknown) as any, []);
    c.emitStorage('kill_counter', {});
    c.emitStorage('kill_counter_session', {});
    const als: { pattern: RegExp; callback: any }[] = [];
    initImproveCounter((c as unknown) as any, kill, als);
    c.emitStorage('improve_counter', { level: 2, lastObjNum: 1 });
    c.emitStorage('improve_counter_lifetime', { entries: [{ date: '1970/1/1', count: 2 }] });
    await Promise.resolve();
    // same object number reports same level again
    setItemSync('object_num', '1');
    // server replays improvements from 1 to 2 on reconnect
    c.dispatch('gmcp.char.state', { improve: 1 });
    c.dispatch('gmcp.char.state', { improve: 2 });
    await Promise.resolve();
    const showLife = als.find((a) => a.pattern.source === '\\/postepy2$')!.callback;
    showLife();
    const printed = stripAnsiCodes(c.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });
});
