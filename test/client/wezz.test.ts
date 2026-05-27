import { FakeClient, initHerbClient } from './helpers/herbClient';
import { characterStorage } from '@modules/core/storage';

beforeEach(() => {
  localStorage.clear();
  characterStorage.setCharacter('TestChar');
  jest.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe('wezz alias', () => {
  let client: FakeClient;
  beforeEach(() => {
    client = new FakeClient();
    initHerbClient(client, { 1: { deliona: 1 }, 2: { deliona: 1 } });
  });

  test('takes herbs from multiple bags', async () => {
    const alias = client.aliases.find(a => a.pattern.test('/wezz deliona 2'))!;
    const m = '/wezz deliona 2'.match(alias.pattern) as RegExpMatchArray;
    await alias.callback(m);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wez 1 zolty jasny kwiat z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'otworz 2. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(5, 'wez 1 zolty jasny kwiat z 2. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(6, 'zamknij 2. swoj woreczek');
    expect(characterStorage.get('herb_counts')).toEqual({ 1: { herbs: {} }, 2: { herbs: {} } });
  });

  test('takes multiple herbs from one bag in bulk', async () => {
    characterStorage.set('herb_counts', { 1: { herbs: { deliona: 5 } } } as any);
    const alias = client.aliases.find(a => a.pattern.test('/wezz deliona 3'))!;
    const m = '/wezz deliona 3'.match(alias.pattern) as RegExpMatchArray;
    await alias.callback(m);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(
      2,
      'wez 3 zolte jasne kwiaty z 1. swojego woreczka'
    );
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    expect(characterStorage.get('herb_counts')).toEqual({ 1: { herbs: { deliona: 2 } } });
  });

  test('defaults to one herb', async () => {
    const alias = client.aliases.find(a => a.pattern.test('/wezz deliona'))!;
    const m = '/wezz deliona'.match(alias.pattern) as RegExpMatchArray;
    await alias.callback(m);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wez 1 zolty jasny kwiat z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    expect(characterStorage.get('herb_counts')).toEqual({ 1: { herbs: {} }, 2: { herbs: { deliona: 1 } } });
  });
});
