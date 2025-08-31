import initUserAliases, { UserAlias } from '../src/scripts/userAliases';

class FakeClient {
  aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
  addEventListener = jest.fn();
  port = { postMessage: jest.fn() } as any;
  sendCommand = jest.fn();
}

describe('userAliases', () => {
  test('supports percent placeholders', () => {
    const client = new FakeClient();
    initUserAliases((client as unknown) as any);
    const apply = client.addEventListener.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserAlias[] = [{ pattern: 'foo.*', command: 'cmd %% %0 %1 %-1 %-2' }];
    apply({ detail: { key: 'aliases', value: list } } as any);
    const alias = client.aliases[0];
    const m = 'foo bar baz'.match(alias.pattern)!;
    alias.callback(m);
    expect(client.sendCommand).toHaveBeenCalledWith('cmd foo bar baz foo bar bar baz baz');
  });
});
