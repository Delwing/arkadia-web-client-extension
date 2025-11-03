import initWeaponEvaluation from '@client/scripts/weaponEvaluation';
import Triggers, {stripAnsiCodes} from '@client/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  print = jest.fn();
}

describe('weapon evaluation trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initWeaponEvaluation((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('parses evaluation lines', () => {
    parse('Zauwazasz, iz obosieczny topor bojowy jest przystosowany do chwytania w dowolnej rece.');
    parse('Za jego pomoca mozna zadawac rany ciete.');
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jak na topor jest on doskonale wywazony i fantastycznie skuteczne.');

    const output = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(output).toContain('Typ broni: topor');
    expect(output).toContain('Chwyt: w dowolnej rece');
    expect(output).toContain('Obrazenia: ciete');
    expect(output).toContain('Wywazenie: [12/14]');
    expect(output).toContain('Skutecznosc: [14/14]');
    expect(output).toContain('Suma: 26');
    expect(output).toContain('Srednia: 13');
  });
});
