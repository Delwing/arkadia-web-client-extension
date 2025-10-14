import initHerbCounter from '../../src/scripts/herbCounter';

export class FakeClient {
  aliases: { pattern: RegExp; callback: Function }[] = [];
  Triggers = { registerTrigger: jest.fn() } as any;
  sendCommand = jest.fn();
  println = jest.fn();
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
  client: { aliases: { pattern: RegExp; callback: Function }[] },
  herbCounts: Record<number, Record<string, number>> = {},
  herbData: any = defaultHerbData,
  aliases = client.aliases
) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(herbData)
  });
  const dataCatalogModule = require('../../src/dataCatalog/catalogInstance') as any;
  if (typeof dataCatalogModule.__setHerbData === 'function') {
    dataCatalogModule.__setHerbData(herbData);
  }
  localStorage.setItem('herb_counts', JSON.stringify(herbCounts));
  initHerbCounter((client as unknown) as any, aliases);
}

