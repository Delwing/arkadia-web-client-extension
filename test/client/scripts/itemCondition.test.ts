import initItemCondition from '@client/scripts/itemCondition';
import Triggers, { stripAnsiCodes } from '@client/Triggers';

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

  test('handles lines without jest or sa after inspection', () => {
    parse('Wykonujesz kilka probnych wymachow mieczem.');
    const result = parse('Wyglada na to, ze liczne walki wyryly na nim swoje pietno.');
    expect(stripAnsiCodes(result)).toBe(
      'Wyglada na to, ze liczne walki wyryly na nim swoje pietno. [5/7]'
    );
  });

  test('handles znakomity stan after inspection', () => {
    parse('Fachowym okiem spogladasz na miecz.');
    const result = parse('Twoj miecz jest w znakomitym stanie.');
    expect(stripAnsiCodes(result)).toBe('Twoj miecz jest w znakomitym stanie. [max]');
  });

  test('handles zly stan after inspection', () => {
    parse('Dokladnie obracasz w dloniach tarcze.');
    const result = parse('Tarcza jest w zlym stanie.');
    expect(stripAnsiCodes(result)).toBe('Tarcza jest w zlym stanie. [4/7]');
  });

  test('handles konserwacje after inspection', () => {
    parse('Przygladasz sie krytycznie lance, sprawdzajac palcem jej stan.');
    const result = parse('Lanca jest wymaga natychmiastowej konserwacji.');
    expect(stripAnsiCodes(result)).toBe('Lanca jest wymaga natychmiastowej konserwacji. [2/7]');
  });

  test('handles pekniecie after inspection', () => {
    parse('Przejezdzajac palcem po ostrzu puklerza, sprawdzasz jego stan.');
    const result = parse('Puklerz jest moze peknac w kazdej chwili.');
    expect(stripAnsiCodes(result)).toBe('Puklerz jest moze peknac w kazdej chwili. [1/7]');
  });

  test('handles juz alternative after inspection', () => {
    parse('Uderzasz kontrolnie miecz o dlonie, oceniajac stan swojego oreza.');
    const result = parse('Zauwazasz, ze miecz jest juz w zlym stanie.');
    expect(stripAnsiCodes(result)).toBe('Zauwazasz, ze miecz jest juz w zlym stanie. [4/7]');
  });

  test('does not trigger without preceding inspection action', () => {
    const result = parse('Twoj miecz jest w znakomitym stanie.');
    expect(stripAnsiCodes(result)).toBe('Twoj miecz jest w znakomitym stanie.');
  });

  test('does not trigger for non-matching lines', () => {
    parse('Wykonujesz kilka probnych wymachow mieczem.');
    const result = parse('To jest jakis inny tekst.');
    expect(stripAnsiCodes(result)).toBe('To jest jakis inny tekst.');
  });
});
