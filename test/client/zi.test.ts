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

describe('/zi alias', () => {
  let client: FakeClient;
  beforeEach(() => {
    client = new FakeClient();
    initHerbClient(client, { 1: { deliona: 1 } });
  });

  test('takes herb and performs action', async () => {
    const alias = client.aliases.find(a => a.pattern.test('/zi rub deliona'))!;
    const m = '/zi rub deliona'.match(alias.pattern) as RegExpMatchArray;
    await alias.callback(m);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wez 1 zolty jasny kwiat z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'rub zolty jasny kwiat');
  });

  test('runs pre-use commands before taking the herb', async () => {
    characterStorage.set('settings', { herbPreUseCommand: 'wstan; dobadz' } as any);
    client = new FakeClient();
    initHerbClient(client, { 1: { deliona: 1 } });
    const alias = client.aliases.find(a => a.pattern.test('/zi rub deliona'))!;
    const m = '/zi rub deliona'.match(alias.pattern) as RegExpMatchArray;
    await alias.callback(m);
    expect(client.sendCommand).toHaveBeenNthCalledWith(1, 'wstan');
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'dobadz');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'otworz 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'wez 1 zolty jasny kwiat z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(5, 'zamknij 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(6, 'rub zolty jasny kwiat');
  });
});
