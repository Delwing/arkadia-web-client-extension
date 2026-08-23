import initHerbDescriptions from '@client/scripts/herbDescriptions';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { EventEmitter } from 'events';
import { FakeClientBase } from './helpers/fakeClient';

class FakeClient extends FakeClientBase {
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
  on(event: string, cb: any) { this.emitter.on(event, cb); }
  off(event: string, cb: any) { this.emitter.off(event, cb); }
  dispatch(event: string, detail: any) { this.emitter.emit(event, detail); }
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
    const result = client.Triggers.parseLine(new AnsiAwareBuffer(line), '');
    expect(result?.text.startsWith('Widzisz zolty jasny kwiat ')).toBe(true);
    expect(result?.text).toContain('deliona');
    expect(result?.text).toBe('Widzisz zolty jasny kwiat (deliona)');
  });

  test('adds herb name with different case', async () => {
    const client = new FakeClient();
    await initHerbDescriptions((client as unknown) as any);
    const line = 'Zolty jasny kwiat.';
    const result = client.Triggers.parseLine(new AnsiAwareBuffer(line), '');
    expect(result?.text).toBe('Zolty jasny kwiat (deliona).');
  });

  test('does not duplicate herb name', async () => {
    const client = new FakeClient();
    await initHerbDescriptions((client as unknown) as any);
    const line = 'Widzisz zolty jasny kwiat (deliona)';
    const result = client.Triggers.parseLine(new AnsiAwareBuffer(line), '');
    expect(result?.text).toBe(line);
  });

  test('inserts suffix on trigger line instances regardless of source', async () => {
    const client = new FakeClient();
    const registerSpy = jest.spyOn(client.Triggers, 'registerTokenTrigger');
    await initHerbDescriptions((client as unknown) as any);
    const [, callback] = registerSpy.mock.calls.find(([token]) => token === 'zolty jasny kwiat')!;
    registerSpy.mockRestore();

    const baseLine = 'Widzisz zolty jasny kwiat';
    const matches = ['zolty jasny kwiat'] as RegExpMatchArray;
    matches.index = baseLine.indexOf('zolty jasny kwiat');
    matches.input = baseLine;

    const triggerLineFromRaw = new AnsiAwareBuffer(baseLine);
    const fromRaw = callback(triggerLineFromRaw, matches, '', baseLine) as AnsiAwareBuffer;
    expect(fromRaw).toBeInstanceOf(AnsiAwareBuffer);
    expect(fromRaw?.text).toBe('Widzisz zolty jasny kwiat (deliona)');

    const existingLine = new AnsiAwareBuffer(baseLine);
    const fromTriggerLine = callback(existingLine, matches, '', baseLine) as AnsiAwareBuffer;
    expect(fromTriggerLine).toBe(existingLine);
    expect(fromTriggerLine?.text).toBe('Widzisz zolty jasny kwiat (deliona)');
  });
});
