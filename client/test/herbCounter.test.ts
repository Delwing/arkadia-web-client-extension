import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { initHerbClient, defaultHerbData } from './helpers/herbClient';
import appEventBus from '../src/events/app-event-bus';

jest.mock('../src/dataCatalog/catalogInstance', () => {
  const { defaultHerbData } = require('./helpers/herbClient');
  let herbData = defaultHerbData;

  return {
    __esModule: true,
    dataCatalog: {
      getHerbsStore: () => ({
        getData: () => Promise.resolve(herbData)
      })
    },
    __setHerbData: (data: any) => {
      herbData = data;
    }
  };
});

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  sendCommand = jest.fn();
  println = jest.fn();
  private index = 0;
  OutputHandler = {
    makeStringRightClickable: (str: string) => {
      const idx = this.index++;
      return `{clickOpen:${idx}}${str}{clickClose}`;
    }
  } as any;
  FunctionalBind = { set: jest.fn() } as any;
  contentWidth = 80;
}

describe('herb counter', () => {
  let client: FakeClient;
  let parse: (line: string) => string;
  let start: () => void;

  beforeEach(() => {
    appEventBus.clear();
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
    appEventBus.emit('contentWidth', 40);
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

  test('prints summary from storage', () => {
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initHerbClient((client as unknown) as any, { 1: { deliona: 2 } }, defaultHerbData, aliases);
    const show = aliases[1].callback as any;
    show();
    const printed = client.println.mock.calls[0][0];
    expect(printed).toMatch(/2/);
    expect(printed).toMatch(/deliona/);
  });
});
