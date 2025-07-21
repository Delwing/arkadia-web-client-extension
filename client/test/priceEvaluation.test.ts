import initPriceEvaluation from '../src/scripts/priceEvaluation';
import Triggers, { stripAnsiCodes } from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
}

describe('price evaluation trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initPriceEvaluation((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('converts and colors currency', () => {
    const result = parse('Wydaje ci sie, ze jest wart okolo 570 miedziakow.');
    expect(stripAnsiCodes(result)).toBe(
      'Wydaje ci sie, ze jest wart okolo 570 miedziakow, czyli 2 zl, 7 sr, 6 mdz.'
    );
  });

  test('handles mithryl coins', () => {
    const result = parse('Wydaje ci sie, ze jest wart okolo 48000 miedziakow.');
    expect(stripAnsiCodes(result)).toBe(
      'Wydaje ci sie, ze jest wart okolo 48000 miedziakow, czyli 2 mth.'
    );
  });
});
