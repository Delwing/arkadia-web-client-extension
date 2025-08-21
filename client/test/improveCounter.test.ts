import { initImproveCounter } from '../src/scripts/improveCounter';
import { initKillCounter } from '../src/scripts/kill';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { colorString, findClosestColor } from '../src/Colors';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  TeamManager = { isInTeam: jest.fn() };
  prefix = (line: string, prefix: string) => prefix + line;
  print = jest.fn();
  println = jest.fn();
  port = { postMessage: jest.fn() } as any;

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

describe('improve counter', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let show: () => void;
  let showLifetime: () => void;
  let reset: () => void;
  let aliases: { pattern: RegExp; callback: any }[];

  beforeEach(() => {
    jest.useFakeTimers();
    client = new FakeClient();
    const killCounter = initKillCounter((client as unknown) as any, []);
    client.dispatch('storage', { key: 'kill_counter', value: {} });
    client.dispatch('storage', { key: 'kill_counter_session', value: {} });
    aliases = [];
    initImproveCounter((client as unknown) as any, killCounter, aliases);
    client.dispatch('storage', { key: 'improve_counter', value: {} });
    client.dispatch('storage', { key: 'improve_counter_lifetime', value: {} });
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
    show = aliases[0].callback;
    reset = aliases[1].callback;
    showLifetime = aliases[2].callback;
    // reset state using alias
    reset();
  });

  test('records state changes, prints notification and table', () => {
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    client.dispatch('gmcp.char.state', { improve: 3, object_num: 2 });
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
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    client.println.mockClear();
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    expect(client.println).not.toHaveBeenCalled();
  });

  test('counts initial level above zero as multiple improvements', () => {
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- 2/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });

  test('reset event clears entries', () => {
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    client.dispatch('gmcp.char.state', { improve: 3, object_num: 2 });
    show();
    client.print.mockClear();
    client.dispatch('reset', undefined);
    show();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/Dzisiaj: 0/);
    expect(printed).not.toMatch(/1\. male/);
  });

  test('lifetime list persists', () => {
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    client.dispatch('gmcp.char.state', { improve: 3, object_num: 2 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/\[\s*1\]/);
    expect(printed).toMatch(/- 3/);
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
    showLifetime();
    let printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- 2/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    client.print.mockClear();
    removeCount!.callback('/postepy2- 1 1'.match(removeCount!.pattern)!);
    showLifetime();
    printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- 1/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 1 postepow/);
  });

  test('ignores duplicate improvements for same object', () => {
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    client.dispatch('gmcp.char.state', { improve: 3, object_num: 2 });
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 2 });
    client.dispatch('gmcp.char.state', { improve: 3, object_num: 2 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- 3/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 3 postepow/);
  });

  test('handles improvement delta', () => {
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    client.dispatch('gmcp.char.state', { improve: 4, object_num: 2 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- 4/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 4 postepow/);
  });

  test('adds initial improvement when not yet recorded', () => {
    client.dispatch('storage', { key: 'improve_counter', value: { level: 0 } });
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- 2/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    client.print.mockClear();
    // duplicate state should not add again
    client.dispatch('gmcp.char.state', { improve: 2, object_num: 1 });
    showLifetime();
    const printed2 = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed2).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });

  test('adds missed improvements on login before lifetime loads', () => {
    jest.useFakeTimers();
    const c = new FakeClient();
    const kill = initKillCounter((c as unknown) as any, []);
    c.dispatch('storage', { key: 'kill_counter', value: {} });
    c.dispatch('storage', { key: 'kill_counter_session', value: {} });
    const als: { pattern: RegExp; callback: any }[] = [];
    initImproveCounter((c as unknown) as any, kill, als);
    c.dispatch('storage', {
      key: 'improve_counter',
      value: { level: 2, lastObjNum: 1 },
    });
    c.dispatch('gmcp.char.state', { improve: 4, object_num: 3 });
    c.dispatch('storage', { key: 'improve_counter_lifetime', value: {} });
    const showLife = als.find((a) => a.pattern.source === '\\/postepy2$')!.callback;
    showLife();
    const printed = stripAnsiCodes(c.print.mock.calls[0][0]);
    expect(printed).toMatch(/- 2/);
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
});
