import initHerbDescriptions, { HERB_NAME_COLOR } from '../src/scripts/herbDescriptions';
import Triggers from '../src/Triggers';
import { color, RESET } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
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
    expect(result).toBe(
      'Widzisz zolty jasny kwiat ' +
        '(' +
        color(HERB_NAME_COLOR) +
        'deliona' +
        RESET +
        ')'
    );
  });

  test('does not duplicate herb name', async () => {
    const client = new FakeClient();
    await initHerbDescriptions((client as unknown) as any);
    const line = 'Widzisz zolty jasny kwiat (deliona)';
    const result = client.Triggers.parseLine(line, '');
    expect(result).toBe(line);
  });
});
