import initCoinColors from '@client/scripts/coinColors';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('coin colors trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initCoinColors((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('colors coins in receive sentence', () => {
    const line = 'Otrzymujesz 11 zlotych, 15 srebrnych i 8 miedzianych monet.';
    const result = parse(line);
    expect(result?.text).toContain('11 zlotych');
    expect(result?.text).toContain('15 srebrnych');
    expect(result?.text).toContain('8 miedzianych');
    const segments = result?.getSegments();
    expect(segments?.some(seg => seg.state?.foreground)).toBe(true);
    expect(result?.text).toBe(line);
  });

  test('does not color words without following monety', () => {
    const line = 'Masz 10 srebrnych monet i zlote.';
    const result = parse(line);
    expect(result?.text).toContain('10 srebrnych');
    expect(result?.text).toContain(' i zlote.');
    expect(result?.text).toBe(line);
  });
});
