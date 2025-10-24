import { emitFakeLine } from '../src/scripts/fakeLine';

describe('emitFakeLine', () => {
  test('processes fake line through client pipeline', () => {
    const processed = '{clickOpen:32}oset{clickClose}';
    const parsed = 'parsed-result';
    const client: any = {
      onLine: jest.fn(() => processed),
      clientAdapter: {
        parseAnsiPatterns: jest.fn(() => parsed),
        output: jest.fn(),
        emit: jest.fn(),
      },
    };

    emitFakeLine(client, 'Kolczasta wysuszona roslina.');

    expect(client.onLine).toHaveBeenCalledWith('Kolczasta wysuszona roslina.', 'combat.avatar');
    expect(client.clientAdapter.parseAnsiPatterns).toHaveBeenCalledWith(processed);
    expect(client.clientAdapter.output).toHaveBeenCalledWith(parsed, 'combat.avatar');
    expect(client.clientAdapter.emit).toHaveBeenCalledWith('output-sent', 1);
  });
});
