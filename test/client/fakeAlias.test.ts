import initFakeLine, { emitFakeLine } from '@client/scripts/fakeLine';

describe('emitFakeLine', () => {
  test('processes fake line through client pipeline', () => {
    const parsedLine = {
      toHtml: jest.fn()
    };
    const client: any = {
      onLine: jest.fn(() => [parsedLine]),
      clientAdapter: {
        output: jest.fn(),
        emit: jest.fn(),
      },
    };

    emitFakeLine(client, 'Kolczasta wysuszona roslina.');

    expect(client.onLine).toHaveBeenCalledWith('Kolczasta wysuszona roslina.', 'combat.avatar');
    expect(client.clientAdapter.output).toHaveBeenCalledWith(parsedLine, 'combat.avatar');
    expect(client.clientAdapter.emit).toHaveBeenCalledWith('output-sent', 1);
  });
});

describe('initFakeLine', () => {
  test('registers the /fake alias and routes the line through onLine', () => {
    const aliases: any[] = [];
    const client: any = {
      onLine: jest.fn(() => []),
      clientAdapter: { output: jest.fn(), emit: jest.fn() },
    };

    initFakeLine(client, aliases as any);

    expect(aliases).toHaveLength(1);
    const matches = '/fake Ranisz szczura.'.match(aliases[0].pattern);
    aliases[0].callback(matches);

    expect(client.onLine).toHaveBeenCalledWith('Ranisz szczura.', 'combat.avatar');
  });

  test('--type picks the line type', () => {
    const aliases: any[] = [];
    const client: any = {
      onLine: jest.fn(() => []),
      clientAdapter: { output: jest.fn(), emit: jest.fn() },
    };

    initFakeLine(client, aliases as any);
    aliases[0].callback('/fake --type=text Rozgladasz sie.'.match(aliases[0].pattern));

    expect(client.onLine).toHaveBeenCalledWith('Rozgladasz sie.', 'text');
  });
});
