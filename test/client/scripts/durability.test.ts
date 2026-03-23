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

  test.each([
    ['naprawde dlugo', '8d'],
    ['bardzo dlugo', '5d-8d'],
    ['dlugo', '3d-5d'],
    ['raczej dlugo', '2d-3d'],
    ['troche', '1d-2d'],
    ['raczej krotko', '6h-1d'],
    ['krotko', '1h-6h'],
    ['bardzo krotko', '1h'],
  ])('handles wyglada line with "%s" → [%s]', (phrase, short) => {
    const result = parse(`Wyglada na to, ze moglby ci jeszcze ${phrase} sluzyc.`);
    expect(result?.text).toBe(
      `Wyglada na to, ze moglby ci jeszcze ${phrase} [${short}] sluzyc.`
    );
  });

  test.each([
    ['naprawde dlugo', '8d'],
    ['bardzo dlugo', '5d-8d'],
    ['dlugo', '3d-5d'],
    ['raczej dlugo', '2d-3d'],
    ['troche', '1d-2d'],
    ['raczej krotko', '6h-1d'],
    ['krotko', '1h-6h'],
    ['bardzo krotko', '1h'],
  ])('handles posluzy line with "%s" → [%s]', (phrase, short) => {
    const result = parse(`sztylet (posluzy ${phrase})`);
    expect(result?.text).toBe(`sztylet (posluzy ${phrase} [${short}])`);
  });

  test('handles posluzy with additional info', () => {
    const result = parse('miecz (posluzy raczej krotko, jest w zlym stanie)');
    expect(result?.text).toBe(
      'miecz (posluzy raczej krotko [6h-1d], jest w zlym stanie)'
    );
  });
});
