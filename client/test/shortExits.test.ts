import initShortExits, { parseExitString, toShort } from '../src/scripts/shortExits';
import Triggers from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  println = jest.fn();
  addEventListener = jest.fn();
}

describe('short exits trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initShortExits(client as unknown as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
    const handler = client.addEventListener.mock.calls[0]?.[1];
    if (handler) {
      handler({ detail: { shortenExits: true } } as any);
    }
    jest.clearAllMocks();
  });

  test('parseExitString splits directions', () => {
    expect(parseExitString('polnoc, poludnie i wschod')).toEqual(['polnoc', 'poludnie', 'wschod']);
  });

  test('toShort converts directions', () => {
    expect(toShort('polnoc')).toBe('n');
    expect(toShort('south')).toBe('s');
    expect(toShort('north')).toBe('n');
    expect(toShort('unknown')).toBe('');
  });

  test('replaces exit line', () => {
    const result = parse('Sa tutaj dwa widoczne wyjscia: polnoc i wschod.');
    expect(result).toBe('~SKIP~');
    expect(client.println).toHaveBeenCalledWith('\n-----: N E\n');
  });
});
