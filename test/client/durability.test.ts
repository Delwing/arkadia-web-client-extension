import initDurability from '@client/scripts/durability';
import Triggers, { stripAnsiCodes } from '@client/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('durability trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initDurability((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('handles wyglada na to line', () => {
    const result = parse('Wyglada na to, ze moglby ci jeszcze naprawde dlugo sluzyc.');
    expect(stripAnsiCodes(result)).toBe(
      'Wyglada na to, ze moglby ci jeszcze naprawde dlugo [8d] sluzyc.'
    );
  });

  test('handles posluzy line', () => {
    const result = parse('sztylet (posluzy krotko)');
    expect(stripAnsiCodes(result)).toBe('sztylet (posluzy krotko [1h-6h])');
  });

  test('handles posluz z dodatkiem', () => {
    const result = parse('miecz (posluzy raczej krotko, jest w zlym stanie)');
    expect(stripAnsiCodes(result)).toBe(
      'miecz (posluzy raczej krotko [6h-1d], jest w zlym stanie)'
    );
  });
});
