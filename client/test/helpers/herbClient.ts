import { EventEmitter } from 'events';
import initHerbCounter from '../../src/scripts/herbCounter';

export class FakeClient {
  private emitter = new EventEmitter();
  aliases: { pattern: RegExp; callback: Function }[] = [];
  Triggers = { registerTrigger: jest.fn() } as any;
  sendCommand = jest.fn();
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

export const defaultHerbData = {
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
};

export function initHerbClient(
  client: { aliases: { pattern: RegExp; callback: Function }[]; dispatch(event: string, detail: any): void },
  herbCounts: Record<number, Record<string, number>> = {},
  herbData: any = defaultHerbData,
  aliases = client.aliases
) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(herbData)
  });
  localStorage.setItem('herb_counts', JSON.stringify(herbCounts));
  initHerbCounter((client as unknown) as any, aliases);
  client.dispatch('storage', { key: 'herb_counts', value: herbCounts });
}

