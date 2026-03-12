import initAnimalTaming from '@client/scripts/animalTaming';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
}

describe('animal taming trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initAnimalTaming((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('adds level for plochliwe', () => {
    const result = parse('Sadzac po zachowaniu zwierze jest plochliwe.')?.text;
    expect(result).toBe('Sadzac po zachowaniu zwierze jest plochliwe [1/10].');
  });

  test('adds level for spokojne', () => {
    const result = parse('Sadzac po zachowaniu zwierze jest spokojne.')?.text;
    expect(result).toBe('Sadzac po zachowaniu zwierze jest spokojne [5/10].');
  });

  test('adds level for calkowicie oddane', () => {
    const result = parse('Sadzac po zachowaniu zwierze jest calkowicie oddane.')?.text;
    expect(result).toBe('Sadzac po zachowaniu zwierze jest calkowicie oddane [10/10].');
  });

  test('adds level for lojalne', () => {
    const result = parse('Sadzac po zachowaniu zwierze jest lojalne.')?.text;
    expect(result).toBe('Sadzac po zachowaniu zwierze jest lojalne [8/10].');
  });

  test('does not match unrelated lines', () => {
    const result = parse('Jakis inny tekst.')?.text;
    expect(result).toBe('Jakis inny tekst.');
  });
});
