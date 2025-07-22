import initParryShieldEvaluation from '../src/scripts/parryShieldEvaluation';
import Triggers, { stripAnsiCodes } from '../src/Triggers';

class FakeClient {
  Triggers = new Triggers({} as unknown as any);
  print = jest.fn();
}

describe('parry shield evaluation trigger', () => {
  let client: FakeClient;
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initParryShieldEvaluation(client as unknown as any);
    parse = (line: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  test('parses parry line', () => {
    parse('Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest ona fantastycznie skuteczna w parowaniu ciosow.');

    const output = stripAnsiCodes(client.print.mock.calls[0][0]);
    expect(output).toContain('Typ zbroi: puklerze');
    expect(output).toContain('Parowanie: [14/14]');
    expect(output).not.toContain('Suma');
    expect(output).not.toContain('Srednia');
  });
});
