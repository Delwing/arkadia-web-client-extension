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

  const colored = (line: string) => {
    const result = parse(line);
    expect(result?.text).toBe(line);
    return (result?.getSegments() ?? [])
      .filter(seg => seg.state?.foreground)
      .map(seg => seg.text)
      .join('|');
  };

  test.each([
    ['Masz trzy zlote monety.', 'trzy zlote'],
    ['Masz wiele zlotych monet.', 'wiele zlotych'],
    ['Masz trzynascie srebrnych monet.', 'trzynascie srebrnych'],
    ['Masz czterdziesci trzy miedziane monety.', 'czterdziesci trzy miedziane'],
    ['Masz dwadziescia jeden zlotych monet.', 'dwadziescia jeden zlotych'],
    ['Masz piecdziesiat siedem srebrnych monet.', 'piecdziesiat siedem srebrnych'],
    ['Masz sto dwadziescia piec miedzianych monet.', 'sto dwadziescia piec miedzianych'],
    ['Masz kilkanascie mithrylowych monet.', 'kilkanascie mithrylowych'],
    ['Wyjmujesz jedna zlota monete.', 'jedna zlota'],
    ['Placisz 12 srebrnymi monetami.', '12 srebrnymi'],
    ['Nie masz zadnej zlotej monety.', 'zlotej'],
    ['Masz zlote monety.', 'zlote'],
  ])('colors the amount with the metal: %s', (line, expected) => {
    expect(colored(line)).toBe(expected);
  });

  test('does not take an unrelated word before the metal', () => {
    expect(colored('Wyjmujesz zlote monety.')).toBe('zlote');
  });

  test('does not color across sentences', () => {
    expect(colored('Widzisz zlote runo. Lezy tu moneta.')).toBe('');
  });
});
