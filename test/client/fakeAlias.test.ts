import { emitFakeLine } from '@client/scripts/fakeLine';

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
