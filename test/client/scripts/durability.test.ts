import initDurability from '@client/scripts/durability';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('durability trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initDurability((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('handles wyglada na to line', () => {
    const result = parse('Wyglada na to, ze moglby ci jeszcze naprawde dlugo sluzyc.');
    expect(result?.text).toBe(
      'Wyglada na to, ze moglby ci jeszcze naprawde dlugo [8d] sluzyc.'
    );
  });

  test('handles posluzy line', () => {
    const result = parse('sztylet (posluzy krotko)');
    expect(result?.text).toBe('sztylet (posluzy krotko [1h-6h])');
  });

  test('handles posluz z dodatkiem', () => {
    const result = parse('miecz (posluzy raczej krotko, jest w zlym stanie)');
    expect(result?.text).toBe(
      'miecz (posluzy raczej krotko [6h-1d], jest w zlym stanie)'
    );
  });
});
