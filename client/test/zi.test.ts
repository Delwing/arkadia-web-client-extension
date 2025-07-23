import initHerbCounter from '../src/scripts/herbCounter';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  aliases: { pattern: RegExp; callback: Function }[] = [];
  Triggers = { registerTrigger: jest.fn() } as any;
  sendCommand = jest.fn();
  println = jest.fn();
  port = { postMessage: jest.fn() } as any;
  addEventListener(event: string, cb: any) { this.emitter.on(event, cb); }
  removeEventListener(event: string, cb: any) { this.emitter.off(event, cb); }
  dispatch(event: string, detail: any) { this.emitter.emit(event, { detail }); }
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('/zi alias', () => {
  let client: FakeClient;
  beforeEach(() => {
    client = new FakeClient();
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
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
          herb_id_to_use: {}
        })
    });
    initHerbCounter((client as unknown) as any, client.aliases);
    client.dispatch('storage', {
      key: 'herb_counts',
      value: { 1: { deliona: 1 } }
    });
  });

  test('takes herb and performs action', async () => {
    const alias = client.aliases.find(a => a.pattern.test('/zi rub deliona'))!;
    const m = '/zi rub deliona'.match(alias.pattern) as RegExpMatchArray;
    await alias.callback(m);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wez zolty jasny kwiat z 1. woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'rub zolty jasny kwiat');
  });
});
