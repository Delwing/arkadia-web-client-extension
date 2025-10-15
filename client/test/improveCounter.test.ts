import { initImproveCounter } from '../src/scripts/improveCounter';
import { initKillCounter } from '../src/scripts/kill';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { colorString, findClosestColor } from '../src/Colors';
import { setItemSync } from '../src/storage';
import appEventBus from '../src/events/app-event-bus';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  TeamManager = { isInTeam: jest.fn() };
  prefix = (line: string, prefix: string) => prefix + line;
  print = jest.fn();
  println = jest.fn();
}

describe('improve counter', () => {
  type SetupOptions = {
    improveCounter?: any;
    improveCounterLifetime?: any;
    objectNum?: number;
    killCounter?: any;
    killCounterSession?: any;
  };

  let client: FakeClient;
  let parse: (line: string) => string;
  let show: () => void;
  let showLifetime: () => void;
  let reset: () => void;
  let aliases: { pattern: RegExp; callback: any }[];

  const setup = (options: SetupOptions = {}) => {
    appEventBus.clear();
    localStorage.clear();
    setItemSync('object_num', options.objectNum ?? 1);
    setItemSync('kill_counter', options.killCounter ?? {});
    setItemSync('kill_counter_session', options.killCounterSession ?? {});
    setItemSync('improve_counter', options.improveCounter ?? {});
    setItemSync('improve_counter_lifetime', options.improveCounterLifetime ?? {});
    client = new FakeClient();
    const killCounter = initKillCounter((client as unknown) as any, []);
    aliases = [];
    initImproveCounter((client as unknown) as any, killCounter, aliases);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
    const findAlias = (pattern: RegExp) =>
      aliases.find((a) => a.pattern.toString() === pattern.toString())?.callback;
    show = findAlias(/\/postepy$/)!;
    reset = findAlias(/\/postepy_reset$/)!;
    showLifetime = findAlias(/\/postepy2$/)!;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('1970-01-01T00:00:00Z'));
    setup();
    reset();
  });

  afterEach(() => {
    jest.useRealTimers();
    appEventBus.clear();
    localStorage.clear();
  });

  test('records state changes, prints notification and table', () => {
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    appEventBus.emit('gmcp.char.state', { improve: 3 });
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
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    client.println.mockClear();
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    expect(client.println).not.toHaveBeenCalled();
  });

  test('counts initial level above zero as multiple improvements', () => {
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });

  test('reset event clears entries', () => {
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    appEventBus.emit('gmcp.char.state', { improve: 3 });
    show();
    client.print.mockClear();
    appEventBus.emit('reset');
    show();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/Dzisiaj: 0/);
    expect(printed).not.toMatch(/1\. male/);
  });

  test('lifetime list persists', () => {
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    parse('Zabiles smoka chaosu.');
    jest.advanceTimersByTime(30000);
    appEventBus.emit('gmcp.char.state', { improve: 3 });
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
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    appEventBus.emit('gmcp.char.state', { improve: 3 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 3 postepow/);
  });

  test('handles improvement delta', () => {
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    appEventBus.emit('gmcp.char.state', { improve: 4 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- nieduze/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 4 postepow/);
  });

  test('adds initial improvement when not yet recorded', () => {
    setup({ improveCounter: { level: 0 } });
    jest.setSystemTime(new Date('1970-01-01T00:00:00Z'));
    reset();
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    client.print.mockClear();
    // duplicate state should not add again
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    showLifetime();
    const printed2 = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed2).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });

  test('adds missed improvements on login before lifetime loads', () => {
    setup({ improveCounter: { level: 2, lastObjNum: 1 }, improveCounterLifetime: {} });
    jest.setSystemTime(new Date('1970-01-01T00:00:00Z'));
    reset();
    appEventBus.emit('gmcp.char.state', { improve: 4 });
    const showLife = aliases.find((a) => a.pattern.source === '\\/postepy2$')!.callback;
    showLife();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/- bardzo male/);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
    expect(client.println).not.toHaveBeenCalled();
  });

  test('counts improvement without object number', () => {
    appEventBus.emit('gmcp.char.state', { improve: 1 });
    show();
    let printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/Dzisiaj: 1/);
    client.print.mockClear();
    showLifetime();
    printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 1 postepow/);
  });

  test('counts offline improvements and new gains after login', () => {
    setup({
      improveCounter: { level: 2, lastObjNum: 1 },
      improveCounterLifetime: { entries: [{ date: '1970/1/1', count: 2 }] },
    });
    jest.setSystemTime(new Date('1970-01-01T00:00:00Z'));
    reset();
    appEventBus.emit('gmcp.char.state', { improve: 4 });
    showLifetime();
    let printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 4 postepow/);
    client.print.mockClear();
    appEventBus.emit('gmcp.char.state', { improve: 5 });
    appEventBus.emit('gmcp.char.state', { improve: 6 });
    showLifetime();
    printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 6 postepow/);
  });

  test('accumulates improvements across sessions with object numbers', () => {
    setup({
      improveCounter: { level: 3, lastObjNum: 1 },
      improveCounterLifetime: { entries: [{ date: '1970/1/1', count: 3 }] },
      objectNum: 2,
    });
    jest.setSystemTime(new Date('1970-01-01T00:00:00Z'));
    reset();
    appEventBus.emit('gmcp.char.state', { improve: 6 });
    showLifetime();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 9 postepow/);
  });

  test('does not re-add improvements when reconnecting with same object number', () => {
    setup({
      improveCounter: { level: 2, lastObjNum: 1 },
      improveCounterLifetime: { entries: [{ date: '1970/1/1', count: 2 }] },
      objectNum: 1,
    });
    jest.setSystemTime(new Date('1970-01-01T00:00:00Z'));
    reset();
    // server replays improvements from 1 to 2 on reconnect
    appEventBus.emit('gmcp.char.state', { improve: 1 });
    appEventBus.emit('gmcp.char.state', { improve: 2 });
    const showLife = aliases.find((a) => a.pattern.source === '\\/postepy2$')!.callback;
    showLife();
    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/WSZYSTKICH DO TEJ PORY: 2 postepow/);
  });
});
