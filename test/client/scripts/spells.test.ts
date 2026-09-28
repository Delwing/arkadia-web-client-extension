import initSpells from '@client/scripts/spells';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  sendEvent = jest.fn();
  playSound = jest.fn();
}

describe('spell triggers', () => {
  let parse: (line: string) => string | undefined;

  beforeEach(() => {
    const client = new FakeClient();
    initSpells((client as unknown) as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '')?.text;
  });

  test('labels blur cast on me', () => {
    const line = 'Wpierw twoje dlonie, a potem ksztalty calego ciala staja sie zupelnie niewyrazne. Trudno bedzie cie teraz dojrzec lub dosiegnac bronia.';
    expect(parse(line)).toContain(`[ ROZMYCIE ] ${line}`);
  });

  test.each([
    ["Czujesz, ze efekt dzialania czaru 'rozmycie' konczy sie, a ty na powrot stajesz sie dla wszystkich wyraznie widoczny.", 'ROZMYCIE END'],
    ["Czujesz, ze efekt dzialania czaru 'przeobrazenie' konczy sie.", 'PRZEOBRAZENIE END'],
  ])('labels any spell ending on me: %s', (line, label) => {
    expect(parse(line)).toContain(`[ ${label} ] ${line}`);
  });

  test('leaves disarm end to its own gag', () => {
    const line = "Czujesz, ze efekt dzialania czaru 'rozbrojenie postaci' konczy sie i powoli odzyskujesz czucie w swoich dloniach.";
    expect(parse(line)).toBe(line);
  });
});
