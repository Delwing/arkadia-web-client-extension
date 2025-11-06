import { emitFakeLine } from '@client/scripts/fakeLine';

describe('emitFakeLine', () => {
  test('processes fake line through client pipeline', () => {
    const parsedHtml = 'parsed-html-result';
    const parsedLine = {
      toHtml: jest.fn(() => parsedHtml)
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
    expect(parsedLine.toHtml).toHaveBeenCalled();
    expect(client.clientAdapter.output).toHaveBeenCalledWith(parsedHtml, 'combat.avatar');
    expect(client.clientAdapter.emit).toHaveBeenCalledWith('output-sent', 1);
  });
});
