jest.mock('@client/scripts/magicsLoader', () => jest.fn().mockResolvedValue(['magiczny miecz']));

import initOdlozMagie from '@client/scripts/odlozMagie';

class FakeClient {
  aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
  sendCommand = jest.fn();
  FunctionalBind = { set: jest.fn() } as any;
  Triggers = {
    registerTrigger: jest.fn(),
    removeTrigger: jest.fn(),
  } as any;
}

describe('/odloz_magie alias', () => {
  test('creates functional bind for magic items', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const alias = client.aliases.find(a => a.pattern.test('/odloz_magie'))!;
    const m = '/odloz_magie'.match(alias.pattern) as RegExpMatchArray;
    alias.callback(m);
    expect(client.sendCommand).toHaveBeenCalledWith('i');
    const cb = client.Triggers.registerTrigger.mock.calls[0][1];
    const TriggerLine = require('@client/triggers/TriggerLine').default;
    const triggerLine = new TriggerLine('Masz przy sobie magiczny miecz');
    triggerLine.setMatches({
        matches: ['Masz przy sobie magiczny miecz', 'magiczny miecz'] as RegExpMatchArray,
        type: ''
    });
    cb(triggerLine);
    expect(client.FunctionalBind.set).toHaveBeenCalledWith('wloz magiczny miecz do skrzyni');
    expect(client.Triggers.removeTrigger).toHaveBeenCalled();
  });

  test('uses provided container when argument passed', async () => {
    const client = new FakeClient();
    await initOdlozMagie((client as unknown) as any, client.aliases);
    const alias = client.aliases.find(a => a.pattern.test('/odloz_magie kufra'))!;
    const m = '/odloz_magie kufra'.match(alias.pattern) as RegExpMatchArray;
    alias.callback(m);
    expect(client.sendCommand).toHaveBeenCalledWith('i');
    const cb = client.Triggers.registerTrigger.mock.calls[0][1];
    const TriggerLine = require('@client/triggers/TriggerLine').default;
    const triggerLine = new TriggerLine('Masz przy sobie magiczny miecz');
    triggerLine.setMatches({
        matches: ['Masz przy sobie magiczny miecz', 'magiczny miecz'] as RegExpMatchArray,
        type: ''
    });
    cb(triggerLine);
    expect(client.FunctionalBind.set).toHaveBeenCalledWith('wloz magiczny miecz do kufra');
    expect(client.Triggers.removeTrigger).toHaveBeenCalled();
  });
});

