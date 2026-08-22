import { EventEmitter } from 'events';
import initHerbCounter from '@client/scripts/herbCounter';
import { normalizeHerbBagsState } from '@client/types/herbs';
import { characterStorage } from '@modules/core/storage';
import { FakeClientBase } from './fakeClient';

export class FakeClient extends FakeClientBase {
  private emitter = new EventEmitter();
  aliases: { pattern: RegExp; callback: Function }[] = [];
  Triggers = { registerTrigger: jest.fn() } as any;
  sendCommand = jest.fn();
  println = jest.fn();
  herbManager: any;
  sendEvent(type: string, detail: any) {
    this.emitter.emit(type, detail);
  }
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
  off(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  dispatch(event: string, detail: any) {
    this.emitter.emit(event, detail);
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
  herbCounts: Record<number, any> = {},
  herbData: any = defaultHerbData,
  aliases = client.aliases
) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(herbData)
  });
  initHerbCounter((client as unknown) as any, aliases);
  characterStorage.set('herb_counts', normalizeHerbBagsState(herbCounts) as any);
}
