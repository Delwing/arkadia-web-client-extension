import initItemCondition from '@client/scripts/itemCondition';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  on = jest.fn();
  off = jest.fn();
}

describe('itemCondition trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initItemCondition((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  test('handles lines without jest or sa after inspection', () => {
    parse('Wykonujesz kilka probnych wymachow mieczem.');
    const result = parse('Wyglada na to, ze liczne walki wyryly na nim swoje pietno.');
    expect(result?.text).toBe(
      'Wyglada na to, ze liczne walki wyryly na nim swoje pietno. [5/7]'
    );
  });

  test('handles znakomity stan after inspection', () => {
    parse('Fachowym okiem spogladasz na miecz.');
    const result = parse('Twoj miecz jest w znakomitym stanie.');
    expect(result?.text).toBe('Twoj miecz jest w znakomitym stanie. [max]');
  });

  test('handles zly stan after inspection', () => {
    parse('Dokladnie obracasz w dloniach tarcze.');
    const result = parse('Tarcza jest w zlym stanie.');
    expect(result?.text).toBe('Tarcza jest w zlym stanie. [4/7]');
  });

  test('handles konserwacje after inspection', () => {
    parse('Przygladasz sie krytycznie lance, sprawdzajac palcem jej stan.');
    const result = parse('Lanca jest wymaga natychmiastowej konserwacji.');
    expect(result?.text).toBe('Lanca jest wymaga natychmiastowej konserwacji. [2/7]');
  });

  test('handles pekniecie after inspection', () => {
    parse('Przejezdzajac palcem po ostrzu puklerza, sprawdzasz jego stan.');
    const result = parse('Puklerz jest moze peknac w kazdej chwili.');
    expect(result?.text).toBe('Puklerz jest moze peknac w kazdej chwili. [1/7]');
  });

  test('handles juz alternative after inspection', () => {
    parse('Uderzasz kontrolnie miecz o dlonie, oceniajac stan swojego oreza.');
    const result = parse('Zauwazasz, ze miecz jest juz w zlym stanie.');
    expect(result?.text).toBe('Zauwazasz, ze miecz jest juz w zlym stanie. [4/7]');
  });

  test('standalone clothing wear pattern colors and suffixes condition', () => {
    const result = parse('Zauwazasz, ze kosciana maska z ludzkiej czaszki jest juz w bardzo zlym stanie.');
    expect(result?.text).toBe(
      'Zauwazasz, ze kosciana maska z ludzkiej czaszki jest juz w bardzo zlym stanie. [3/7]'
    );
  });

  test('standalone clothing wear pattern without juz', () => {
    const result = parse('Zauwazasz, ze kosciana maska z ludzkiej czaszki jest w zlym stanie.');
    expect(result?.text).toBe(
      'Zauwazasz, ze kosciana maska z ludzkiej czaszki jest w zlym stanie. [4/7]'
    );
  });

  test('does not trigger without preceding inspection action', () => {
    const result = parse('Twoj miecz jest w znakomitym stanie.');
    expect(result?.text).toBe('Twoj miecz jest w znakomitym stanie.');
  });

  test('does not trigger for non-matching lines', () => {
    parse('Wykonujesz kilka probnych wymachow mieczem.');
    const result = parse('To jest jakis inny tekst.');
    expect(result?.text).toBe('To jest jakis inny tekst.');
  });
});
