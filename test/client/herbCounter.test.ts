import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { EventEmitter } from 'events';
import { initHerbClient, defaultHerbData } from './helpers/herbClient';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers(({} as unknown) as any);
  sendCommand = jest.fn();
  print = jest.fn();
  println = jest.fn();
  port = { postMessage: jest.fn() } as any;
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
    client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    start = aliases[0].callback as any;
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
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

  test('prints summary from storage', async () => {
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient((client as unknown) as any, {}, defaultHerbData, aliases);
    const showEntry = aliases.find(({ pattern }) => pattern.test('/ziola_pokaz'));
    expect(showEntry).toBeTruthy();
    const show = showEntry!.callback as any;
    const printedPromise = new Promise<AnsiAwareBuffer>((resolve) => {
      // The herbCounter calls client.print(), not println
      client.print.mockImplementationOnce((buffer: AnsiAwareBuffer) => {
        resolve(buffer);
      });
    });
    show();
    client.dispatch('storage', { key: 'herb_counts', value: { 1: { deliona: 2 } } });
    const printed = await printedPromise;

    // Extract text from the AnsiAwareBuffer
    const text = printed.text;
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
      client.port.postMessage.mockClear();
      wearEntry?.callback();
      expect(client.sendCommand).toHaveBeenCalledWith('ocen wszystkie woreczki');
      parse('Ten element ekwipunku wyglada na troche zuzyty.');
      parse('Ten element ekwipunku wyglada na calkiem nowy.');
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      const setCalls = client.port.postMessage.mock.calls
        .map(([arg]) => arg)
        .filter(call => call?.type === 'SET_STORAGE');
      expect(setCalls[setCalls.length - 1]).toEqual({
        type: 'SET_STORAGE',
        key: 'herb_counts',
        value: {
          1: { herbs: {}, condition: 3 },
          2: { herbs: {}, condition: 5 }
        }
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
    const setCalls = client.port.postMessage.mock.calls
      .map(([arg]) => arg)
      .filter(call => call?.type === 'SET_STORAGE');
    expect(setCalls).toContainEqual({
      type: 'SET_STORAGE',
      key: 'herb_counts',
      value: { 1: { herbs: {} }, 2: { herbs: { deliona: 1 } } }
    });
  });

  test('herb manager put adds herbs to bag', async () => {
    initHerbClient((client as unknown) as any, { 1: {} });
    const manager = (client as unknown as any).herbManager;
    await manager.put('deliona', 2, 1);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wloz 2 zolte jasne kwiaty do 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    const setCalls = client.port.postMessage.mock.calls
      .map(([arg]) => arg)
      .filter(call => call?.type === 'SET_STORAGE');
    expect(setCalls).toContainEqual({
      type: 'SET_STORAGE',
      key: 'herb_counts',
      value: { 1: { herbs: { deliona: 2 } } }
    });
  });
});
