import { initKillCounter, parseName, formatSessionTable, formatLifetimeTable } from '../src/scripts/kill';
import Triggers, { stripAnsiCodes } from '../src/Triggers';

import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  private storageListeners: Record<string, Set<(value: any) => void>> = {};
  Triggers = new Triggers(({} as unknown) as any);
  TeamManager = { isInTeam: jest.fn() };
  prefix = (line: string, prefix: string) => prefix + line;
  print = jest.fn();
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
  sendEvent = jest.fn((type: string, detail: any) => {
    this.dispatch(type, detail);
  });

  emitStorage(key: string, value: any) {
    this.storeData[key] = value;
    const listeners = this.storageListeners[key];
    if (listeners) {
      listeners.forEach((cb) => {
        Promise.resolve().then(() => cb(value));
      });
    }
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

describe('kill counter team kills', () => {
  let client: FakeClient;

  beforeEach(() => {
    client = new FakeClient();
    initKillCounter((client as unknown) as any, []);
    client.emitStorage('kill_counter', {});
    client.emitStorage('kill_counter_session', {});
  });

  const parse = (line: string) => {
    return Triggers.prototype.parseLine.call(client.Triggers, line, '');
  };

  test('ignores kills from outside the team', () => {
    client.TeamManager.isInTeam.mockReturnValue(false);
    const line = '> Eamon zabil smoka chaosu.';
    let result = parse(line);
    expect(result).toContain('[   ZABIL   ]');
    expect(result).not.toContain('(');

    client.TeamManager.isInTeam.mockReturnValue(true);
    result = parse(line);
    expect(stripAnsiCodes(result)).toContain('(0 / 1)');
  });

  test('counts kills from team members', () => {
    client.TeamManager.isInTeam.mockReturnValue(true);
    const line = '> Eamon zabil smoka chaosu.';
    const result = parse(line);
    expect(result).toContain('[   ZABIL   ]');
    expect(stripAnsiCodes(result)).toContain('(0 / 1)');
  });

  test('session count persists after storage update', () => {
    client.TeamManager.isInTeam.mockReturnValue(true);
    let result = parse('> Eamon zabil smoka chaosu.');
    expect(stripAnsiCodes(result)).toContain('(0 / 1)');

    client.emitStorage('kill_counter', { 'smoka chaosu': 1 });

    result = parse('> Eamon zabil smoka chaosu.');
    expect(stripAnsiCodes(result)).toContain('(0 / 2)');
  });
});

describe('kill counter scenario', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let printSessionTable: () => void;
  let aliases: { pattern: RegExp; callback: () => void }[];

  beforeEach(() => {
    aliases = [];
    client = new FakeClient();
    initKillCounter((client as unknown) as any, aliases);
    client.emitStorage('kill_counter', {});
    client.emitStorage('kill_counter_session', {});
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
    // alias[0] corresponds to the /zabici command which prints
    // the per-session kill table
    printSessionTable = aliases[0].callback;
  });

  test('player and team kills accumulate and print session table correctly', () => {
    parse('Zabiles smoka chaosu.');
    parse('Zabilas smoka chaosu.');
    client.TeamManager.isInTeam.mockReturnValue(true);
    parse('Eamon zabil smoka chaosu.');

    printSessionTable();

    const printed = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(printed).toMatch(/smoka chaosu/);
    expect(printed).toMatch(/smoka chaosu .* 2/);
    expect(printed).toMatch(/LACZNIE:.*2/);
    expect(printed).toMatch(/DRUZYNA LACZNIE:.*3/);
  });

  test('zabici_reset clears session counts', () => {
    parse('Zabiles smoka chaosu.');
    printSessionTable();
    let printed = stripAnsiCodes(client.print.mock.calls.pop()[0]);
    expect(printed).toMatch(/smoka chaosu/);
    // alias[2] corresponds to /zabici_reset
    aliases[2].callback();
    printSessionTable();
    printed = stripAnsiCodes(client.print.mock.calls.pop()[0]);
    expect(printed).not.toMatch(/smoka chaosu/);
  });

  test('reset event clears session counts', () => {
    parse('Zabiles smoka chaosu.');
    printSessionTable();
    client.print.mockClear();
    client.dispatch('reset', undefined);
    printSessionTable();
    const printed = stripAnsiCodes(client.print.mock.calls.pop()[0]);
    expect(printed).not.toMatch(/smoka chaosu/);
  });
});

describe('parseName and formatTable', () => {
  test('parseName returns expected values', () => {
    expect(parseName('Troll')).toBe('Troll');
    expect(parseName('smoka chaosu')).toBe('smoka chaosu');
    expect(parseName('Wielki Troll')).toBe('troll');
  });

  test('formatSessionTable prints table with totals', () => {
    const table = formatSessionTable({
      troll: { mySession: 1, myTotal: 1, teamSession: 0 },
      smok: { mySession: 0, myTotal: 0, teamSession: 2 },
    });
    expect(table).toMatch(/Licznik zabitych/);
    expect(table).toMatch(/troll/);
    expect(table).toMatch(/troll .* 1/);
    expect(table).toMatch(/DRUZYNA LACZNIE/);
  });

  test('formatLifetimeTable prints header and sorts names', () => {
    const summary = formatLifetimeTable({
      Bbb: { mySession: 0, myTotal: 1, teamSession: 0 },
      Aaa: { mySession: 0, myTotal: 2, teamSession: 0 },
      goblin: { mySession: 0, myTotal: 1, teamSession: 0 },
    });
    const stripped = stripAnsiCodes(summary);
    expect(stripped).toMatch(/Licznik zabitych/);
    const indexAaa = stripped.indexOf('Aaa');
    const indexGoblin = stripped.indexOf('goblin');
    expect(indexAaa).toBeLessThan(indexGoblin);
  });
});
