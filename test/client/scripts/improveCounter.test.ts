import { initImproveCounter } from '@client/scripts/improveCounter';
import { initKillCounter } from '@client/scripts/kill';
import Triggers from '@client/Triggers';
import { colorString, createColorFormat } from '@modules/core/Colors';
import { EventEmitter } from 'events';
import { characterStorage } from '@modules/core/storage';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { FakeClientBase } from '../helpers/fakeClient';

class FakeClient extends FakeClientBase {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  TeamManager = { isInTeam: jest.fn() };
  prefix = (line: string, prefix: string) => prefix + line;
  print = jest.fn();
  println = jest.fn();
  port = { postMessage: jest.fn() } as any;

  on(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.off(event, cb);
  }
  off(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  emit(event: string, detail?: any) {
    this.emitter.emit(event, detail);
  }
  dispatch(event: string, detail: any) {
    this.emit(event, detail);
  }
}

describe('improve counter', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  let show: () => void;
  let showLifetime: () => void;
  let reset: () => void;
  let aliases: { pattern: RegExp; callback: any }[];

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    characterStorage.set('object_num','1');
    client = new FakeClient();
    initKillCounter((client as unknown) as any, []);
    characterStorage.set('kill_counter', {} as any);
    characterStorage.set('kill_counter_session', {} as any);
    aliases = [];
    initImproveCounter((client as unknown) as any, aliases);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    // aliases: /postepy(0), /postepy_popup(1), /postepy_reset(2), /postepy2(3), ...
    show = aliases[0].callback;
    reset = aliases[2].callback;
    showLifetime = aliases[3].callback;
    // reset state using alias
    reset();
  });

  test('records state changes, prints notification and table', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    client.dispatch('gmcp.char.state', { improve: 3 });
    const orange = createColorFormat('#ffa500');
    const message = colorString('\tWlasnie wbiles postepy: male (czas:   0:30)', orange);
    expect(client.println).toHaveBeenCalledWith(message);
    show();
    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/2\. male/);
    expect(printed).toMatch(/czas   0:30/);
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
    const printed = client.print.mock.calls[0][0]?.text;
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
    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/Dzisiaj: 3/);
    expect(printed).not.toMatch(/1\. male/);
  });

  test('lifetime list persists', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    client.dispatch('gmcp.char.state', { improve: 3 });
    showLifetime();
    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/\[\s*1]/);
    expect(printed).toMatch(/- male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 3 postepow/);
    client.print.mockClear();
    // reset should not clear lifetime
    reset();
    showLifetime();
    const printed2 = client.print.mock.calls[0][0]?.text;
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
    let info = client.println.mock.calls[0][0]?.text;
    expect(info).toMatch(/Dodano 2 postepow/);
    expect(info).toMatch(/lacznie: 2/);
    client.println.mockClear();
    showLifetime();
    let printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    client.print.mockClear();
    removeCount!.callback('/postepy2- 1 1'.match(removeCount!.pattern)!);
    info = client.println.mock.calls[0][0]?.text;
    expect(info).toMatch(/Usunieto 1 postepow/);
    expect(info).toMatch(/lacznie: 1/);
    client.println.mockClear();
    showLifetime();
    printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/- nieznaczne/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 1 postepow/);
  });

  test('ignores duplicate improvements for same level', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    client.dispatch('gmcp.char.state', { improve: 2 });
    client.dispatch('gmcp.char.state', { improve: 3 });
    showLifetime();
    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/- male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 3 postepow/);
  });

  test('handles improvement delta', () => {
    client.dispatch('gmcp.char.state', { improve: 2 });
    client.dispatch('gmcp.char.state', { improve: 4 });
    showLifetime();
    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/- nieduze/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 4 postepow/);
  });

  test('adds initial improvement when not yet recorded', () => {
    characterStorage.set('improve_counter', { level: 0 });
    client.dispatch('gmcp.char.state', { improve: 2 });
    showLifetime();
    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    client.print.mockClear();
    // duplicate state should not add again
    client.dispatch('gmcp.char.state', { improve: 2 });
    showLifetime();
    const printed2 = client.print.mock.calls[0][0]?.text;
    expect(printed2).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });

  test('adds missed improvements on login before lifetime loads', () => {
    jest.useFakeTimers();
    const c = new FakeClient();
    initKillCounter((c as unknown) as any, []);
    characterStorage.set('kill_counter', {} as any);
    characterStorage.set('kill_counter_session', {} as any);
    const als: { pattern: RegExp; callback: any }[] = [];
    characterStorage.remove('object_num');
    characterStorage.set('improve_counter', { level: 2, lastObjNum: 1 });
    initImproveCounter((c as unknown) as any, als);
    c.dispatch('gmcp.char.state', { improve: 4 });
    const showLife = als.find((a) => a.pattern.source === '\\/postepy2$')!.callback;
    showLife();
    const printed = c.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    expect(c.println).not.toHaveBeenCalled();
  });

  test('counts improvement without object number', () => {
    client.dispatch('gmcp.char.state', { improve: 1 });
    show();
    let printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/Dzisiaj: 1/);
    client.print.mockClear();
    showLifetime();
    printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 1 postepow/);
  });

  test('counts offline improvements and new gains after login', () => {
    characterStorage.set('improve_counter', { level: 2, lastObjNum: 1 });
    characterStorage.set('improve_counter_lifetime', { entries: [{ date: '1970/1/1', count: 2 }] });
    client.dispatch('gmcp.char.state', { improve: 4 });
    showLifetime();
    let printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 4 postepow/);
    client.print.mockClear();
    client.dispatch('gmcp.char.state', { improve: 5 });
    client.dispatch('gmcp.char.state', { improve: 6 });
    showLifetime();
    printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 6 postepow/);
  });

  test('accumulates improvements across sessions with object numbers', () => {
    characterStorage.set('improve_counter', { level: 3, lastObjNum: 1 });
    characterStorage.set('improve_counter_lifetime', { entries: [{ date: '1970/1/1', count: 3 }] });
    characterStorage.set('object_num','2');
    client.dispatch('gmcp.char.state', { improve: 6 });
    showLifetime();
    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 9 postepow/);
  });

  test('does not record false improvement when switching characters without reload', () => {
    // Character A logs in and plays
    characterStorage.setCharacter('charA');
    characterStorage.set('object_num', '1');
    client.dispatch('gmcp.char.state', { improve: 2 });
    client.println.mockClear();
    client.print.mockClear();

    // Simulate character switch: storage scope changes, triggering onChange
    characterStorage.setCharacter('charB');
    // The reset event fires (from Client.ts when object_num changes)
    client.dispatch('reset', undefined);
    characterStorage.set('object_num', '99');

    // Character B logs in with level 0
    client.dispatch('gmcp.char.state', { improve: 0 });

    // Should NOT have printed any "Wlasnie wbiles postepy" message
    const improveCalls = client.println.mock.calls.filter(
      (c: any[]) => c[0]?.text?.includes?.('Wlasnie wbiles postepy')
    );
    expect(improveCalls).toHaveLength(0);

    // Lifetime for new character should be empty (no false entries)
    showLifetime();
    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 0 postepow/);
  });

  test('does not re-add improvements when reconnecting with same object number', () => {
    // simulate existing data: level 2 already recorded for object 1
    const c = new FakeClient();
    initKillCounter((c as unknown) as any, []);
    characterStorage.set('kill_counter', {} as any);
    characterStorage.set('kill_counter_session', {} as any);
    const als: { pattern: RegExp; callback: any }[] = [];
    characterStorage.set('improve_counter', { level: 2, lastObjNum: 1 });
    characterStorage.set('improve_counter_lifetime', { entries: [{ date: '1970/1/1', count: 2 }] });
    initImproveCounter((c as unknown) as any, als);
    // same object number reports same level again
    characterStorage.set('object_num','1');
    // server replays improvements from 1 to 2 on reconnect
    c.dispatch('gmcp.char.state', { improve: 1 });
    c.dispatch('gmcp.char.state', { improve: 2 });
    const showLife = als.find((a) => a.pattern.source === '\\/postepy2$')!.callback;
    showLife();
    const printed = c.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });
});
