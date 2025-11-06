import initPriceEvaluation from '@client/scripts/priceEvaluation';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  on = jest.fn();
  off = jest.fn();
}

describe('price evaluation trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initPriceEvaluation((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('converts and colors currency', () => {
    const result = parse('Wydaje ci sie, ze jest wart okolo 570 miedziakow.');
    expect(result?.text).toBe(
      'Wydaje ci sie, ze jest wart okolo 570 miedziakow, czyli 2 zl, 7 sr, 6 mdz.'
    );
  });

  test('handles mithryl coins', () => {
    const result = parse('Wydaje ci sie, ze jest wart okolo 48000 miedziakow.');
    expect(result?.text).toBe(
      'Wydaje ci sie, ze jest wart okolo 48000 miedziakow, czyli 2 mth.'
    );
  });
});
