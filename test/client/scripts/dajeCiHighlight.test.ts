import initDajeCiHighlight from '@client/scripts/dajeCiHighlight';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('daje ci highlight', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;
  const colored = (result: AnsiAwareBuffer | null) =>
    result?.getSegments().some(seg => seg.state?.foreground) ?? false;

  beforeEach(() => {
    client = new FakeClient();
    initDajeCiHighlight((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('colors what someone gives you', () => {
    const result = parse('Gandalf daje ci dlugi miecz.');
    expect(result?.text).toBe('Gandalf daje ci dlugi miecz.');
    expect(colored(result)).toBe(true);
  });

  test('does not color "daje ci sie we znaki"', () => {
    expect(colored(parse('Twoj ekwipunek daje ci sie we znaki.'))).toBe(false);
  });

  test('does not color "nowy zapal do walki"', () => {
    expect(colored(parse('Widok wroga daje ci nowy zapal do walki.'))).toBe(false);
  });
});
