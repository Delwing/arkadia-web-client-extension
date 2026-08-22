vi.mock('@client/scripts/lib/magicsLoader', () => ({ default: jest.fn().mockResolvedValue(['magiczny miecz', 'rogat[aey] tarcz[aey]']) }));

import initOdlozMagie from '@client/scripts/odlozMagie';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
  sendCommand = jest.fn();
  FunctionalBind = { set: jest.fn() } as any;
  Triggers = {
    registerTrigger: jest.fn(),
    removeTrigger: jest.fn(),
  } as any;
}

function setupAlias(client: FakeClient, command: string) {
  const alias = client.aliases.find(a => a.pattern.test(command))!;
  const m = command.match(alias.pattern) as RegExpMatchArray;
  alias.callback(m);
  return client.Triggers.registerTrigger.mock.calls[0][1];
}

describe('/odloz_magie alias', () => {
  test('creates functional bind for magic item in Masz przy sobie', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const cb = setupAlias(client, '/odloz_magie');
    expect(client.sendCommand).toHaveBeenCalledWith('i');
    cb(new AnsiAwareBuffer('Masz przy sobie magiczny miecz.'));
    expect(client.FunctionalBind.set).toHaveBeenCalledWith('wloz magiczny miecz do skrzyni');
    expect(client.Triggers.removeTrigger).toHaveBeenCalled();
  });

  test('uses provided container when argument passed', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const cb = setupAlias(client, '/odloz_magie kufra');
    cb(new AnsiAwareBuffer('Masz przy sobie magiczny miecz.'));
    expect(client.FunctionalBind.set).toHaveBeenCalledWith('wloz magiczny miecz do kufra');
  });

  test('does not deduplicate items in Masz przy sobie against worn items', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const cb = setupAlias(client, '/odloz_magie');
    // Worn item line (before Masz przy sobie)
    cb(new AnsiAwareBuffer('Nosisz lsniacy magiczny miecz.'));
    // Masz przy sobie with the same magic item
    cb(new AnsiAwareBuffer('Masz przy sobie magiczny miecz.'));
    expect(client.FunctionalBind.set).toHaveBeenCalledWith(
      'wloz magiczny miecz do skrzyni;wloz magiczny miecz do skrzyni'
    );
  });

  test('captures full item text with quantity in Masz przy sobie', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const cb = setupAlias(client, '/odloz_magie');
    cb(new AnsiAwareBuffer('Masz przy sobie dwie szkarlatne rogate tarcze i magiczny miecz.'));
    expect(client.FunctionalBind.set).toHaveBeenCalledWith(
      'wloz dwie szkarlatne rogate tarcze do skrzyni;wloz magiczny miecz do skrzyni'
    );
  });

  test('handles comma-separated items in Masz przy sobie', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const cb = setupAlias(client, '/odloz_magie');
    cb(new AnsiAwareBuffer('Masz przy sobie maly kubek, magiczny miecz, szkarlatna rogata tarcze i kosciany widelec.'));
    expect(client.FunctionalBind.set).toHaveBeenCalledWith(
      'wloz magiczny miecz do skrzyni;wloz szkarlatna rogata tarcze do skrzyni'
    );
  });

  test('sets null when no magic items found', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const cb = setupAlias(client, '/odloz_magie');
    cb(new AnsiAwareBuffer('Masz przy sobie maly kubek i kosciany widelec.'));
    expect(client.FunctionalBind.set).toHaveBeenCalledWith(null);
  });

  test('sets null on Nie masz nic przy sobie', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const cb = setupAlias(client, '/odloz_magie');
    cb(new AnsiAwareBuffer('Nie masz nic przy sobie.'));
    expect(client.FunctionalBind.set).toHaveBeenCalledWith(null);
  });
});
