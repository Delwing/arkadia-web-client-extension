import initItemCondition from '../src/scripts/itemCondition';
import Triggers, { stripAnsiCodes } from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  on = jest.fn();
  off = jest.fn();
}

describe('itemCondition trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initItemCondition((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('handles lines without jest or sa', () => {
    const result = parse('Wyglada na to, ze liczne walki wyryly na nim swoje pietno.');
    expect(stripAnsiCodes(result)).toBe(
      'Wyglada na to, ze liczne walki wyryly na nim swoje pietno. [5/7]'
    );
  });

  test('handles znakomity stan', () => {
    const result = parse('Twoj miecz jest w znakomitym stanie.');
    expect(stripAnsiCodes(result)).toBe('Twoj miecz jest w znakomitym stanie. [max]');
  });

  test('handles zly stan', () => {
    const result = parse('Tarcza jest w zlym stanie.');
    expect(stripAnsiCodes(result)).toBe('Tarcza jest w zlym stanie. [4/7]');
  });

  test('handles konserwacje', () => {
    const result = parse('Lanca jest wymaga natychmiastowej konserwacji.');
    expect(stripAnsiCodes(result)).toBe('Lanca jest wymaga natychmiastowej konserwacji. [2/7]');
  });

  test('handles pekniecie', () => {
    const result = parse('Puklerz jest moze peknac w kazdej chwili.');
    expect(stripAnsiCodes(result)).toBe('Puklerz jest moze peknac w kazdej chwili. [1/7]');
  });

  test('handles juz alternative', () => {
    const result = parse('Zauwazasz, ze miecz jest juz w zlym stanie.');
    expect(stripAnsiCodes(result)).toBe('Zauwazasz, ze miecz jest juz w zlym stanie. [4/7]');
  });
});
