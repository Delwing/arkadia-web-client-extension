import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { EventEmitter } from 'events';
import { initHerbClient, defaultHerbData } from './helpers/herbClient';
import { characterStorage } from '@modules/core/storage';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  sendCommand = jest.fn();
  print = jest.fn();
  println = jest.fn();
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
  on(event: string, cb: any) { this.emitter.on(event, cb); }
  off(event: string, cb: any) { this.emitter.off(event, cb); }
  dispatch(event: string, detail: any) { this.emitter.emit(event, detail); }
}

describe('herb counter', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  let start: () => void;

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('TestChar');
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    start = aliases[0].callback as any;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('counts herbs from bags', async () => {
    await start();
    expect(client.sendCommand).toHaveBeenCalledWith('policz swoje woreczki');
    parse('Doliczyles sie dwoch sztuk.');
    expect(client.sendCommand).toHaveBeenCalledWith('zajrzyj do 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenCalledWith('zajrzyj do 2. swojego woreczka');
    parse('Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W srodku dostrzegasz dwa zolte jasne kwiaty.');
    parse('Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W srodku dostrzegasz zolty jasny kwiat.');
    const printed = client.print.mock.calls[0][0].text;
    expect(printed).toMatch(/3/);
    expect(printed).toMatch(/deliona/);
    expect(printed).toMatch(/1\.\s+2 deliona/);
    expect(printed).toMatch(/2\.\s+1 deliona/);
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
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
    await start2();
    parse2('Doliczyles sie jednej sztuki.');
    parse2(
      'Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W srodku dostrzegasz zolty jasny kwiat.'
    );
    const printed = client.print.mock.calls[0][0].text;
    const lines = printed.split('\n');
    lines.forEach((l) => {
      expect(l.length).toBeLessThanOrEqual(client.contentWidth);
    });
  });

  test('handles empty bag with Uwaznie ogladasz format', async () => {
    await start();
    parse('Doliczyles sie dwoch sztuk.');
    parse('Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojego woreczka. W srodku dostrzegasz zolty jasny kwiat.');
    parse('Uwaznie ogladasz zawartosc szarawego skorzanego woreczka. W jego srodku nic jednak nie ma.');
    expect(client.print).toHaveBeenCalled();
    const printed = client.print.mock.calls[0][0].text;
    expect(printed).toMatch(/1/);
    expect(printed).toMatch(/deliona/);
    expect(printed).toMatch(/2\.\s+\(pusty\)/);
  });

  test('prints summary from storage', async () => {
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    const showEntry = aliases.find(({ pattern }) => pattern.test('/ziola_pokaz'));
    expect(showEntry).toBeTruthy();
    const show = showEntry!.callback as any;
    characterStorage.set('herb_counts', { 1: { herbs: { deliona: 2 } } });
    await show();

    // Extract text from the AnsiAwareBuffer
    const text = client.print.mock.calls[0][0].text;
    expect(text).toMatch(/2/);
    expect(text).toMatch(/deliona/);
  }, 10000);

  test('woreczki alias updates bag conditions', async () => {
    jest.useFakeTimers();
    try {
      const aliases: { pattern: RegExp; callback: () => void }[] = [];
      initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
      const wearEntry = aliases.find(({ pattern }) => pattern.test('/woreczki_buduj'));
      expect(wearEntry).toBeTruthy();
      client.sendCommand.mockClear();
      wearEntry?.callback();
      expect(client.sendCommand).toHaveBeenCalledWith('ocen wszystkie woreczki');
      // Woreczek 1: evaluation start line sets flag, then condition line uses it
      parse('Oceniasz starannie zamkniety woreczek ze skory kota.');
      parse('Ten element ekwipunku wyglada na troche zuzyty.');
      // Woreczek 2
      parse('Oceniasz starannie zamkniety pojemny woreczek z kozlej skory.');
      parse('Ten element ekwipunku wyglada na calkiem nowy.');
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      const stored = characterStorage.get('herb_counts');
      expect(stored).toEqual({
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
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wez 1 zolty jasny kwiat z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'otworz 2. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(5, 'wloz zolty jasny kwiat do 2. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(6, 'zamknij 2. swoj woreczek');
    const stored = characterStorage.get('herb_counts');
    expect(stored).toEqual({ 1: { herbs: {} }, 2: { herbs: { deliona: 1 } } });
  });

  test('herb manager put adds herbs to bag', async () => {
    initHerbClient((client as unknown) as any, { 1: {} });
    const manager = (client as unknown as any).herbManager;
    await manager.put('deliona', 2, 1);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wloz 2 zolte jasne kwiaty do 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    const stored = characterStorage.get('herb_counts');
    expect(stored).toEqual({ 1: { herbs: { deliona: 2 } } });
  });

  test('ziola_przepakuj sends all 7 repack commands in order', async () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_przepakuj 1 2'));
    expect(entry).toBeTruthy();
    client.sendCommand.mockClear();
    entry!.callback(entry!.pattern.exec('/ziola_przepakuj 1 2')!);
    expect(client.sendCommand).toHaveBeenCalledTimes(7);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wez ziola z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'otworz 2. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'wloz ziola do 2. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(5, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(6, 'wloz ziola do 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(7, 'zamknij otwarte woreczki');
  });

  test('ziola_przepakuj rejects same bag, prints error, sends no commands', async () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_przepakuj 1 1'));
    expect(entry).toBeTruthy();
    client.sendCommand.mockClear();
    entry!.callback(entry!.pattern.exec('/ziola_przepakuj 1 1')!);
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('Woreczek zrodlowy i docelowy sa takie same.');
  });

  test('ziola_daj with count takes herbs from pouch and gives to team member', async () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, { 1: { deliona: 3 } }, defaultHerbData, aliases);
    (client as any).TeamManager = { getTeamMemberObjectId: jest.fn().mockReturnValue(42) };
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_daj Pablo deliona 2'));
    expect(entry).toBeTruthy();
    client.sendCommand.mockClear();
    await entry!.callback(entry!.pattern.exec('/ziola_daj Pablo deliona 2')!);
    expect(client.sendCommand).toHaveBeenCalledWith('otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenCalledWith('wez 2 zolte jasne kwiaty z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenCalledWith('zamknij 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenCalledWith('daj ziola ob_42');
  });

  test('ziola_daj with count prints error for unknown team member', async () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, { 1: { deliona: 3 } }, defaultHerbData, aliases);
    (client as any).TeamManager = { getTeamMemberObjectId: jest.fn().mockReturnValue(undefined) };
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_daj Unknown deliona 1'));
    expect(entry).toBeTruthy();
    client.sendCommand.mockClear();
    await entry!.callback(entry!.pattern.exec('/ziola_daj Unknown deliona 1')!);
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('Nie znaleziono czlonka druzyny: Unknown');
  });

  test('ziola_daj with count prints error for unknown herb', async () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    (client as any).TeamManager = { getTeamMemberObjectId: jest.fn().mockReturnValue(42) };
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_daj Pablo nieznana 1'));
    expect(entry).toBeTruthy();
    client.sendCommand.mockClear();
    await entry!.callback(entry!.pattern.exec('/ziola_daj Pablo nieznana 1')!);
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('Nieznane ziolo: nieznana');
  });

  test('ziola_daj single herb takes 1 herb and gives to team member', async () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, { 1: { deliona: 2 } }, defaultHerbData, aliases);
    (client as any).TeamManager = { getTeamMemberObjectId: jest.fn().mockReturnValue(42) };
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_daj Pablo deliona'));
    expect(entry).toBeTruthy();
    client.sendCommand.mockClear();
    await entry!.callback(entry!.pattern.exec('/ziola_daj Pablo deliona')!);
    expect(client.sendCommand).toHaveBeenCalledWith('otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenCalledWith('wez 1 zolty jasny kwiat z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenCalledWith('zamknij 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenCalledWith('daj ziola ob_42');
  });

  test('ziola_odloz_woreczek sends 3 commands for empty bag', () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, { 2: {} }, defaultHerbData, aliases);
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_odloz_woreczek 2'));
    expect(entry).toBeTruthy();
    client.sendCommand.mockClear();
    entry!.callback(entry!.pattern.exec('/ziola_odloz_woreczek 2')!);
    expect(client.sendCommand).toHaveBeenCalledTimes(3);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'odbezpiecz 2. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'odtrocz 2. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'odloz 2. swoj woreczek');
  });

  test('ziola_odloz_woreczek warns when bag has herbs and requires confirmation', () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, { 1: { deliona: 3 } }, defaultHerbData, aliases);
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_odloz_woreczek 1'));
    expect(entry).toBeTruthy();
    client.sendCommand.mockClear();
    client.println.mockClear();
    // First call warns
    entry!.callback(entry!.pattern.exec('/ziola_odloz_woreczek 1')!);
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('Woreczek 1 zawiera ziola. Powtorz komende aby potwierdzic.');
    // Second call proceeds
    entry!.callback(entry!.pattern.exec('/ziola_odloz_woreczek 1')!);
    expect(client.sendCommand).toHaveBeenCalledTimes(3);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'odbezpiecz 1. swoj woreczek');
  });

  test('ziola_odloz_woreczek removes bag from storage after putting down', () => {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initHerbClient((client as unknown) as any, { 1: { deliona: 2 }, 2: {} }, defaultHerbData, aliases);
    const entry = aliases.find(({ pattern }) => pattern.test('/ziola_odloz_woreczek 2'));
    expect(entry).toBeTruthy();
    entry!.callback(entry!.pattern.exec('/ziola_odloz_woreczek 2')!);
    const stored = characterStorage.get('herb_counts');
    expect(stored).not.toHaveProperty('2');
    expect(stored).toHaveProperty('1');
  });
});
