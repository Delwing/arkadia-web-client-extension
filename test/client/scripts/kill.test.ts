import { initKillCounter, parseName, formatSessionTable, formatLifetimeTable, formatLifetimeByDateTable, formatGlobalStatsTable } from '@client/scripts/kill';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';

import { EventEmitter } from 'events';
import { FakeClientBase } from '../helpers/fakeClient';

class FakeClient extends FakeClientBase {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  TeamManager = { isInTeam: jest.fn() };
  prefix = (line: string, prefix: string) => prefix + line;
  print = jest.fn();

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

describe('kill counter team kills', () => {
  let client: FakeClient;

  beforeEach(() => {
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    initKillCounter((client as unknown) as any, []);
    characterStorage.set('kill_counter', {} as any);
    characterStorage.set('kill_counter_session', {} as any);
  });

  afterEach(() => {
    localStorage.clear();
  });

  const parse = (line: string) => {
    return Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  };

  test('ignores kills from outside the team', () => {
    client.TeamManager.isInTeam.mockReturnValue(false);
    const line = '> Eamon zabil smoka chaosu.';
    let result = parse(line);
    expect(result?.text).toContain('[   ZABIL   ]');
    expect(result?.text).not.toContain('(');

    client.TeamManager.isInTeam.mockReturnValue(true);
    result = parse(line);
    expect(result!.text).toContain('(0 / 1)');
  });

  test('counts kills from team members', () => {
    client.TeamManager.isInTeam.mockReturnValue(true);
    const line = '> Eamon zabil smoka chaosu.';
    const result = parse(line);
    expect(result?.text).toContain('[   ZABIL   ]');
    expect(result!.text).toContain('(0 / 1)');
  });

  test('session count persists after storage update', () => {
    client.TeamManager.isInTeam.mockReturnValue(true);
    let result = parse('> Eamon zabil smoka chaosu.');
    expect(result!.text).toContain('(0 / 1)');

    characterStorage.set('kill_counter', { 'smoka chaosu': 1 } as any);

    result = parse('> Eamon zabil smoka chaosu.');
    expect(result!.text).toContain('(0 / 2)');
  });
});

describe('kill counter scenario', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  let printSessionTable: () => void;
  let aliases: { pattern: RegExp; callback: () => void }[];

  beforeEach(() => {
    characterStorage.setCharacter('TestChar');
    aliases = [];
    client = new FakeClient();
    initKillCounter((client as unknown) as any, aliases);
    characterStorage.set('kill_counter', {} as any);
    characterStorage.set('kill_counter_session', {} as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    // alias[0] corresponds to the /zabici command which prints
    // the per-session kill table
    printSessionTable = aliases[0].callback;
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('player and team kills accumulate and print session table correctly', () => {
    parse('Zabiles smoka chaosu.');
    parse('Zabilas smoka chaosu.');
    client.TeamManager.isInTeam.mockReturnValue(true);
    parse('Eamon zabil smoka chaosu.');

    printSessionTable();

    const printed = client.print.mock.calls[0][0]?.text;
    expect(printed).toMatch(/smoka chaosu/);
    expect(printed).toMatch(/smoka chaosu .* 2/);
    expect(printed).toMatch(/LACZNIE:.*2/);
    expect(printed).toMatch(/DRUZYNA LACZNIE:.*3/);
  });

  test('zabici_reset clears session counts', () => {
    parse('Zabiles smoka chaosu.');
    printSessionTable();
    let printed = client.print.mock.calls.pop()[0]?.text;
    expect(printed).toMatch(/smoka chaosu/);
    // alias[6] corresponds to /zabici_reset
    aliases[6].callback();
    printSessionTable();
    printed = client.print.mock.calls.pop()[0]?.text;
    expect(printed).not.toMatch(/smoka chaosu/);
  });

  test('reset event clears session counts', () => {
    parse('Zabiles smoka chaosu.');
    printSessionTable();
    client.print.mockClear();
    client.dispatch('reset', undefined);
    printSessionTable();
    const printed = client.print.mock.calls.pop()[0]?.text;
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
    expect(table.text).toMatch(/Licznik zabitych/);
    expect(table.text).toMatch(/troll/);
    expect(table.text).toMatch(/troll .* 1/);
    expect(table.text).toMatch(/DRUZYNA LACZNIE/);
  });

  test('formatLifetimeTable prints header with character name and sorts names', () => {
    const summary = formatLifetimeTable({
      Bbb: { mySession: 0, myTotal: 1, teamSession: 0 },
      Aaa: { mySession: 0, myTotal: 2, teamSession: 0 },
      goblin: { mySession: 0, myTotal: 1, teamSession: 0 },
    }, 'Eamon');
    const stripped = summary?.text;
    expect(stripped).toMatch(/Licznik zabitych/);
    expect(stripped).toMatch(/POSTAC: Eamon/);
    const indexAaa = stripped.indexOf('Aaa');
    const indexGoblin = stripped.indexOf('goblin');
    expect(indexAaa).toBeLessThan(indexGoblin);
  });

  test('formatLifetimeByDateTable shows character, date in header and totals', () => {
    const table = formatLifetimeByDateTable(
      [
        { mob: 'goblin', count: 3 },
        { mob: 'troll', count: 2 },
      ],
      '2025/1/15',
      'Eamon'
    );
    expect(table.text).toMatch(/2025\/1\/15/);
    expect(table.text).toMatch(/POSTAC: Eamon/);
    expect(table.text).toMatch(/goblin/);
    expect(table.text).toMatch(/troll/);
    expect(table.text).toMatch(/LACZNIE/);
    expect(table.text).toMatch(/5/);
  });

  test('formatGlobalStatsTable shows character and chronological day-by-day breakdown', () => {
    const table = formatGlobalStatsTable([
      {
        date: '2025/1/15',
        kills: [{ mob: 'goblin', count: 3 }, { mob: 'Troll', count: 2 }],
        total: 5,
      },
      {
        date: '2025/1/16',
        kills: [{ mob: 'goblin', count: 1 }],
        total: 1,
      },
    ], 'Eamon');
    expect(table.text).toMatch(/historia/);
    expect(table.text).toMatch(/POSTAC: Eamon/);
    expect(table.text).toMatch(/2025\/1\/15/);
    expect(table.text).toMatch(/2025\/1\/16/);
    expect(table.text).toMatch(/goblin/);
    expect(table.text).toMatch(/Troll/);
    expect(table.text).toMatch(/SUMA/);
    expect(table.text).toMatch(/WSZYSTKICH DO TEJ PORY/);
    expect(table.text).toMatch(/6/);
  });
});

describe('kill counter new aliases', () => {
  test('registers all expected aliases', () => {
    const client = new FakeClient();
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initKillCounter((client as unknown) as any, aliases);

    const patterns = aliases.map(a => a.pattern.source);
    expect(patterns).toContain('\\/zabici$');
    expect(patterns).toContain('\\/zabiciw$');
    expect(patterns).toContain('\\/zabici2 (\\d{4}\\/\\d{1,2}\\/\\d{1,2})$');
    expect(patterns).toContain('\\/zabici2$');
    expect(patterns).toContain('\\/zabici2w$');
    expect(patterns).toContain('\\/zabici2!$');
    expect(patterns).toContain('\\/zabici_reset$');
  });

  test('/zabici2 date alias matches date pattern', () => {
    const client = new FakeClient();
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initKillCounter((client as unknown) as any, aliases);

    const dateAlias = aliases.find(a => a.pattern.source.includes('\\d{4}'));
    expect(dateAlias).toBeDefined();

    const match = '/zabici2 2017/1/22'.match(dateAlias!.pattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('2017/1/22');

    const match2 = '/zabici2 2025/12/31'.match(dateAlias!.pattern);
    expect(match2).not.toBeNull();
    expect(match2![1]).toBe('2025/12/31');
  });
});
