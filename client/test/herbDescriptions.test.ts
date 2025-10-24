import initHerbDescriptions from '../src/scripts/herbDescriptions';
import Triggers, { stripAnsiCodes } from '../src/Triggers';
import { EventEmitter } from 'events';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  private index = 0;
  OutputHandler = {
    makeStringRightClickable: (str: string) => {
      const idx = this.index++;
      return `{clickOpen:${idx}}${str}{clickClose}`;
    }
  } as any;
  FunctionalBind = { set: jest.fn() } as any;
  private emitter = new EventEmitter();
  addEventListener(event: string, cb: any) { this.emitter.on(event, cb); }
  removeEventListener(event: string, cb: any) { this.emitter.off(event, cb); }
  dispatch(event: string, detail: any) { this.emitter.emit(event, { detail }); }
  sendCommand = jest.fn();
}

describe('herb descriptions', () => {
  beforeEach(() => {
    localStorage.clear();
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
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
  });

  test('adds herb name when missing', async () => {
    const client = new FakeClient();
    await initHerbDescriptions((client as unknown) as any);
    const line = 'Widzisz zolty jasny kwiat';
    const result = client.Triggers.parseLine(line, '');
    expect(result.startsWith('Widzisz zolty jasny kwiat ')).toBe(true);
    expect(result).toContain('{clickOpen:0}deliona{clickClose}');
    expect(stripAnsiCodes(result)).toBe('Widzisz zolty jasny kwiat (deliona)');
  });

  test('does not duplicate herb name', async () => {
    const client = new FakeClient();
    await initHerbDescriptions((client as unknown) as any);
    const line = 'Widzisz zolty jasny kwiat (deliona)';
    const result = client.Triggers.parseLine(line, '');
    expect(result).toBe(line);
  });
});
