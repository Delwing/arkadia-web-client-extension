import { FakeClient, initHerbClient } from './helpers/herbClient';

beforeEach(() => {
  jest.clearAllMocks();
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
    expect(client.sendCommand).toHaveBeenNthCalledWith(2, 'wez zolty jasny kwiat z 1. swojego woreczka');
    expect(client.sendCommand).toHaveBeenNthCalledWith(3, 'zamknij 1. swoj woreczek');
    expect(client.sendCommand).toHaveBeenNthCalledWith(4, 'rub zolty jasny kwiat');
  });
});
